/**
 * Knowledge Hub — Zod schemas + validation for normalisation output.
 *
 * Validates LLM output, resolves assignees to contacts/users,
 * checks for duplicates, and prepares rows for DB insertion.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { contacts, users, knowledgeUnits, accounts } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { KnowledgeUnitType, KnowledgeUnitStatus } from "./types";
import { resolveUserName } from "./user-registry";

// --- Zod schemas for LLM output ---

const unitTypeSchema = z.enum([
  "action_item", "decision", "context_update", "content_draft",
  "request", "feedback", "deliverable", "blocker",
  "product_bug", "product_feature",
]);

const extractedUnitSchema = z.object({
  type: unitTypeSchema,
  content: z.string().min(5),
  assignee: z.string().nullable().default(null),
  requestedBy: z.string().nullable().default(null),
  dueDate: z.string().nullable().default(null),
  status: z.enum(["open", "done"]).default("open"),
  confidence: z.number().min(0).max(100),
  sourceMessages: z.array(z.number().int().min(0)).min(1),
  reasoning: z.string(),
});

const completedItemSchema = z.object({
  matchDescription: z.string(),
  evidence: z.string(),
  sourceMessages: z.array(z.number().int().min(0)).optional().default([]),
});

export const extractionOutputSchema = z.object({
  units: z.array(extractedUnitSchema),
  completedItems: z.array(completedItemSchema).default([]),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

export const classificationGroupSchema = z.object({
  messageIndices: z.array(z.number().int().min(0)).min(1),
  accountSlug: z.string().nullable(),
  category: z.enum(["action_items", "decision", "update", "content_work", "discussion", "noise"]),
  worthExtracting: z.boolean(),
  reasoning: z.string(),
});

export const classificationOutputSchema = z.object({
  groups: z.array(classificationGroupSchema),
});

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;

// --- Validation + resolution ---

interface ResolvedUnit {
  accountId: string | null;
  channelId: string;
  unitType: KnowledgeUnitType;
  content: string;
  author: string | null;
  assignee: string | null;
  assigneeContactId: string | null;
  requestedBy: string | null;
  requestedByUserId: string | null;
  status: KnowledgeUnitStatus;
  dueDate: Date | null;
  visibility: string;
  confidence: number;
  sourceEventIds: string[];
  metadata: Record<string, unknown>;
}

/**
 * Validate and resolve extracted units into DB-ready rows.
 * Uses indexToEventId mapping for deterministic source event resolution.
 */
export async function validateAndResolve(
  output: ExtractionOutput,
  channelId: string,
  accountId: string | null,
  visibility: string,
  indexToEventId: Map<number, string>,
  logger: { info: (msg: string) => void; error: (msg: string) => void },
): Promise<{ units: ResolvedUnit[]; completions: number; errors: string[] }> {
  const errors: string[] = [];
  const resolvedUnits: ResolvedUnit[] = [];
  let completions = 0;

  // Preload all lookup data in parallel (avoids N+1 queries)
  const [accountContacts, allUsers, openItems] = await Promise.all([
    accountId
      ? db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(eq(contacts.accountId, accountId))
      : Promise.resolve([]),
    db.select({ id: users.id, name: users.name }).from(users),
    loadOpenItemsForMatching(accountId, channelId),
  ]);

  // Process extracted units
  for (const unit of output.units) {
    const sourceEventIds = unit.sourceMessages
      .map((idx) => {
        // Handle 0-based LLM responses: try as-is first, then +1 for 1-based maps
        return indexToEventId.get(idx) ?? indexToEventId.get(idx + 1);
      })
      .filter((id): id is string => !!id);

    if (sourceEventIds.length === 0) {
      errors.push(`Unit "${unit.content.slice(0, 50)}": no matching events for indices [${unit.sourceMessages.join(",")}]`);
      continue;
    }

    // Resolve assignee → canonical name from Slack user registry
    const assigneeResolved = unit.assignee ? await resolveUserName(unit.assignee) : null;
    const assigneeContact = assigneeResolved?.matched && unit.assignee
      ? findByName(accountContacts, assigneeResolved.canonicalName) : null;

    // Resolve requestedBy → canonical name from Slack user registry
    const requestedByResolved = unit.requestedBy ? await resolveUserName(unit.requestedBy) : null;
    const requestedByUser = requestedByResolved?.matched && unit.requestedBy
      ? findByName(allUsers, requestedByResolved.canonicalName) : null;

    // Check if dueDate is stale (>3 weeks ago). CreatedAt-based staleness
    // is checked in the digest where we have the actual DB timestamp.
    const parsedDue = unit.dueDate ? new Date(unit.dueDate) : null;
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const isStale = parsedDue && parsedDue < threeWeeksAgo && unit.status === "open";

    resolvedUnits.push({
      accountId,
      channelId,
      unitType: unit.type as KnowledgeUnitType,
      content: unit.content,
      author: null,
      assignee: assigneeResolved?.canonicalName ?? unit.assignee,
      assigneeContactId: assigneeContact?.id ?? null,
      requestedBy: requestedByResolved?.canonicalName ?? unit.requestedBy,
      requestedByUserId: requestedByUser?.id ?? null,
      status: unit.status as KnowledgeUnitStatus,
      dueDate: parsedDue,
      visibility,
      confidence: unit.confidence,
      sourceEventIds,
      metadata: {
        reasoning: unit.reasoning,
        needsReview: unit.confidence < 60,
        stale: isStale || undefined,
        unmatchedAssignee: assigneeResolved && !assigneeResolved.matched ? true : undefined,
      },
    });
  }

  // Process completed items (using preloaded open items)
  for (const completed of output.completedItems) {
    const matched = matchFromList(openItems, completed.matchDescription);
    if (matched) {
      await db
        .update(knowledgeUnits)
        .set({ status: "done", metadata: { ...((matched.metadata as Record<string, unknown>) ?? {}), completionEvidence: completed.evidence } })
        .where(eq(knowledgeUnits.id, matched.id));
      completions++;
      logger.info(`Marked as done: "${completed.matchDescription}" → ${matched.id}`);
    }
  }

  return { units: resolvedUnits, completions, errors };
}

// --- Helper functions ---

/** Find a person by name match from a preloaded list. */
function findByName<T extends { name: string }>(list: T[], name: string): T | null {
  const nameLower = name.toLowerCase().trim();
  // Exact match first
  const exact = list.find((item) => item.name.toLowerCase() === nameLower);
  if (exact) return exact;

  // First-name match (only if name is long enough to avoid false positives)
  if (nameLower.length > 3) {
    const firstName = nameLower.split(/\s+/)[0];
    if (firstName.length > 3) {
      const firstNameMatch = list.find((item) => item.name.toLowerCase().split(/\s+/)[0] === firstName);
      if (firstNameMatch) return firstNameMatch;
    }
  }

  // Substring match only if the search name is long enough (>4 chars) to avoid
  // short names like "Al" matching "Alice", "Charlie", etc.
  if (nameLower.length > 4) {
    return list.find((item) => {
      const itemLower = item.name.toLowerCase();
      return itemLower.includes(nameLower) || nameLower.includes(itemLower);
    }) ?? null;
  }

  return null;
}

/** Load open items for completion matching (includes metadata for evidence). */
async function loadOpenItemsForMatching(
  accountId: string | null,
  channelId: string,
): Promise<Array<{ id: string; content: string; metadata: unknown }>> {
  const conditions = [eq(knowledgeUnits.status, "open")];
  if (accountId) {
    conditions.push(eq(knowledgeUnits.accountId, accountId));
  } else {
    // General channels: restrict to same channelId to avoid full-table scan
    conditions.push(isNull(knowledgeUnits.accountId));
    conditions.push(eq(knowledgeUnits.channelId, channelId));
  }

  return db
    .select({ id: knowledgeUnits.id, content: knowledgeUnits.content, metadata: knowledgeUnits.metadata })
    .from(knowledgeUnits)
    .where(and(...conditions))
    .limit(500);
}

/** Match a completion description against preloaded open items. */
function matchFromList(
  openItems: Array<{ id: string; content: string; metadata: unknown }>,
  description: string,
): { id: string; metadata: unknown } | null {
  const descLower = description.toLowerCase();
  return openItems.find((item) => {
    const contentLower = item.content.toLowerCase();
    return contentLower.includes(descLower) || descLower.includes(contentLower);
  }) ?? null;
}

/**
 * Dedup extracted units against existing ones.
 * Returns only units that don't match existing content.
 */
export function dedup(
  newUnits: ResolvedUnit[],
  existing: Array<{ content: string; assignee: string | null }>,
): { kept: ResolvedUnit[]; dropped: number } {
  let dropped = 0;
  const kept: ResolvedUnit[] = [];

  for (const unit of newUnits) {
    const isDupe = existing.some((ex) => {
      const sim = contentSimilarity(unit.content, ex.content);
      if (sim < 0.6) return false;
      // Same assignee or both null → definite dupe
      if (unit.assignee === ex.assignee) return true;
      // Very high similarity even with different assignee → likely dupe
      return sim > 0.85;
    });

    if (isDupe) {
      dropped++;
    } else {
      kept.push(unit);
    }
  }

  return { kept, dropped };
}

/** Simple word-overlap similarity (Jaccard index on words). */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Resolve an account slug to an account ID.
 */
export async function resolveAccountSlug(slug: string): Promise<string | null> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.slug, slug))
    .limit(1);
  return account?.id ?? null;
}
