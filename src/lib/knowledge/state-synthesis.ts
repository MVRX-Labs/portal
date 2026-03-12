/**
 * Knowledge Hub — Account State Synthesis
 *
 * Synthesises knowledge units into per-account "living state documents":
 *   - brief: Executive summary of the account
 *   - open_items: Structured list of all open items grouped by type
 *   - activity_log: Rolling 2-week activity summary
 *
 * Uses Claude Sonnet to generate/update each doc type in a single LLM call.
 */

import { db } from "@/lib/db";
import { knowledgeUnits, knowledgeState, knowledgeChannels, accounts, contacts } from "@/lib/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { callLLM } from "./normaliser-llm";
import { buildStateSynthesisPrompt } from "./prompts";
import { extractJSON } from "@/lib/audit-utils";
import { z } from "zod";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

const stateSynthesisOutputSchema = z.object({
  brief: z.string(),
  openItems: z.string(),
  activityLog: z.string(),
});

export interface SynthesisResult {
  accountId: string;
  accountName: string;
  docsUpdated: number;
  cost: number;
  error: string | null;
}

/**
 * Synthesise state docs for a single account.
 */
export async function synthesiseAccountState(accountId: string, logger: Logger): Promise<SynthesisResult> {
  // Load account info
  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, slug: accounts.slug })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    return { accountId, accountName: "Unknown", docsUpdated: 0, cost: 0, error: "Account not found" };
  }

  const result: SynthesisResult = {
    accountId,
    accountName: account.name,
    docsUpdated: 0,
    cost: 0,
    error: null,
  };

  // Load contacts
  const accountContacts = await db
    .select({ name: contacts.name })
    .from(contacts)
    .where(eq(contacts.accountId, accountId));

  // Load open units (cap at 200 for prompt size)
  const openUnits = await db
    .select({
      unitType: knowledgeUnits.unitType,
      content: knowledgeUnits.content,
      assignee: knowledgeUnits.assignee,
      createdAt: knowledgeUnits.createdAt,
    })
    .from(knowledgeUnits)
    .where(and(eq(knowledgeUnits.accountId, accountId), eq(knowledgeUnits.status, "open")))
    .orderBy(desc(knowledgeUnits.createdAt))
    .limit(200);

  // Load recently done units (last 14 days, cap at 100)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentDoneUnits = await db
    .select({
      unitType: knowledgeUnits.unitType,
      content: knowledgeUnits.content,
      assignee: knowledgeUnits.assignee,
      createdAt: knowledgeUnits.createdAt,
    })
    .from(knowledgeUnits)
    .where(
      and(
        eq(knowledgeUnits.accountId, accountId),
        eq(knowledgeUnits.status, "done"),
        gte(knowledgeUnits.createdAt, fourteenDaysAgo),
      ),
    )
    .orderBy(desc(knowledgeUnits.createdAt))
    .limit(100);

  // Skip synthesis if no units at all
  if (openUnits.length === 0 && recentDoneUnits.length === 0) {
    logger.info(`${account.name}: no units to synthesise, skipping`);
    return result;
  }

  // Load current state docs (for incremental updates)
  const currentDocs = await db
    .select({ stateType: knowledgeState.stateType, content: knowledgeState.content })
    .from(knowledgeState)
    .where(eq(knowledgeState.accountId, accountId));

  const currentBrief = currentDocs.find((d) => d.stateType === "brief")?.content ?? null;
  const currentActivityLog = currentDocs.find((d) => d.stateType === "activity_log")?.content ?? null;

  // Build prompt and call LLM
  const prompt = buildStateSynthesisPrompt(
    account.name,
    accountContacts.map((c) => ({ name: c.name, side: "client" as const })),
    openUnits.map((u) => ({ type: u.unitType, content: u.content, assignee: u.assignee, createdAt: u.createdAt })),
    recentDoneUnits.map((u) => ({
      type: u.unitType,
      content: u.content,
      assignee: u.assignee,
      completedAt: u.createdAt.toISOString().slice(0, 10),
    })),
    currentBrief,
    currentActivityLog,
  );

  try {
    const { output, cost } = await callLLM(prompt, logger);
    result.cost = cost;

    const json = extractJSON(output);
    const parsed = stateSynthesisOutputSchema.parse(JSON.parse(json));

    // Upsert each doc type
    const docTypes = [
      { type: "brief" as const, content: parsed.brief },
      { type: "open_items" as const, content: parsed.openItems },
      { type: "activity_log" as const, content: parsed.activityLog },
    ];

    for (const doc of docTypes) {
      await db
        .insert(knowledgeState)
        .values({
          accountId,
          stateType: doc.type,
          content: doc.content,
          version: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [knowledgeState.accountId, knowledgeState.stateType],
          set: {
            content: doc.content,
            version: sql`${knowledgeState.version} + 1`,
            updatedAt: new Date(),
          },
        });
      result.docsUpdated++;
    }

    logger.info(`${account.name}: synthesised ${result.docsUpdated} docs, $${cost.toFixed(4)}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.error = errMsg.slice(0, 500);
    logger.error(`${account.name}: synthesis failed — ${result.error}`);
  }

  return result;
}

/**
 * Synthesise state for all accounts that have knowledge channels.
 */
export async function synthesiseAllAccounts(logger: Logger): Promise<{
  results: SynthesisResult[];
  totalCost: number;
  errors: number;
}> {
  // Find distinct accounts with active knowledge channels
  const accountRows = await db
    .selectDistinct({ accountId: knowledgeChannels.accountId })
    .from(knowledgeChannels)
    .where(and(eq(knowledgeChannels.active, true), sql`${knowledgeChannels.accountId} IS NOT NULL`));

  const accountIds = accountRows.map((r) => r.accountId!).filter(Boolean);

  if (accountIds.length === 0) {
    logger.info("No accounts with active channels — nothing to synthesise");
    return { results: [], totalCost: 0, errors: 0 };
  }

  logger.info(`Synthesising state for ${accountIds.length} accounts`);

  const results: SynthesisResult[] = [];
  let totalCost = 0;
  let errors = 0;

  for (const accountId of accountIds) {
    const result = await synthesiseAccountState(accountId, logger);
    results.push(result);
    totalCost += result.cost;
    if (result.error) errors++;
  }

  logger.info(`Synthesis complete: ${results.length} accounts, $${totalCost.toFixed(4)}, ${errors} errors`);
  return { results, totalCost, errors };
}
