/** Knowledge Hub — Normalisation orchestrator (extract → validate → dedup → commit). */

import { db } from "@/lib/db";
import { knowledgeChannels, knowledgeEvents, knowledgeUnits } from "@/lib/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";
import {
  loadAccountContext,
  loadAllAccountsBatched,
  loadOpenItems,
  loadExistingSummaries,
  loadExistingForDedup,
  chunkEvents,
} from "./normaliser-loaders";
import { extractJSON } from "@/lib/audit-utils";
import { callLLM } from "./normaliser-llm";
import {
  buildClassificationPrompt,
  buildExtractionPrompt,
  formatMessagesForPrompt,
  type AccountContext,
  type OpenItem,
  type ExtractedSummary,
} from "./prompts";
import {
  classificationOutputSchema,
  extractionOutputSchema,
  validateAndResolve,
  resolveAccountSlug,
  dedup,
} from "./validation";
import { createActionFromUnit, ACTIONABLE_UNIT_TYPES } from "./action-bridge";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

const BATCH_SIZE = 50;
const MAX_RETRIES = 1;

interface NormaliseResult {
  channelName: string;
  eventsProcessed: number;
  unitsExtracted: number;
  unitsDeduplicated: number;
  completionsMarked: number;
  cost: number;
  errors: string[];
}

/**
 * Normalise unprocessed events for a single channel.
 */
export async function normaliseChannel(channelDbId: string, logger: Logger): Promise<NormaliseResult> {
  const [channel] = await db.select().from(knowledgeChannels).where(eq(knowledgeChannels.id, channelDbId)).limit(1);
  if (!channel) throw new Error(`Channel ${channelDbId} not found`);

  const result: NormaliseResult = {
    channelName: channel.slackChannelName,
    eventsProcessed: 0,
    unitsExtracted: 0,
    unitsDeduplicated: 0,
    completionsMarked: 0,
    cost: 0,
    errors: [],
  };

  const allEventsRaw = await db
    .select()
    .from(knowledgeEvents)
    .where(and(eq(knowledgeEvents.channelId, channelDbId), isNull(knowledgeEvents.processedAt)))
    .orderBy(knowledgeEvents.messageAt);

  // Skip voice notes that haven't been transcribed yet — they'll be picked up
  // after resolve-media succeeds. This prevents marking them as processed
  // without their transcription content.
  const pendingVoiceNotes = allEventsRaw.filter(
    (e) => e.contentType === "voice_note" && !e.resolvedContent,
  );
  const allEvents = allEventsRaw.filter(
    (e) => !(e.contentType === "voice_note" && !e.resolvedContent),
  );

  if (pendingVoiceNotes.length > 0) {
    logger.info(`#${channel.slackChannelName}: skipping ${pendingVoiceNotes.length} voice notes awaiting transcription`);
  }

  if (allEvents.length === 0) {
    logger.info(`#${channel.slackChannelName}: no unprocessed events ready for normalisation`);
    return result;
  }

  logger.info(`#${channel.slackChannelName}: ${allEvents.length} unprocessed events (${pendingVoiceNotes.length} voice notes deferred)`);

  const isClientChannel = channel.channelCategory === "client_shared" || channel.channelCategory === "client_internal";
  const visibility = channel.channelCategory === "client_internal" ? "internal" : "shared";

  // Preload context that persists across batches
  const extractedSoFar: ExtractedSummary[] = await loadExistingSummaries(channelDbId);
  const clientAccountCtx = isClientChannel && channel.accountId ? await loadAccountContext(channel.accountId) : null;
  const clientOpenItems = isClientChannel && channel.accountId ? await loadOpenItems(channel.accountId) : [];
  const allAccountsCtx = !isClientChannel ? await loadAllAccountsBatched() : [];
  const existingForDedup = await loadExistingForDedup(channelDbId, channel.accountId);

  const batches = chunkEvents(allEvents, BATCH_SIZE);
  logger.info(`Processing in ${batches.length} batch(es) of up to ${BATCH_SIZE} events`);

  for (let i = 0; i < batches.length; i++) {
    const events = batches[i];
    logger.info(`Batch ${i + 1}/${batches.length}: ${events.length} events`);
    const { text: formattedText, indexToEventId } = formatMessagesForPrompt(events);
    let batchHadFatalError = false;

    if (isClientChannel && channel.accountId && clientAccountCtx) {
      const batchResult = await runExtractionWithRetry(
        formattedText, clientAccountCtx, clientOpenItems, channel.channelCategory,
        channel.accountId, channelDbId, visibility, extractedSoFar, existingForDedup, indexToEventId, logger,
      );
      result.unitsExtracted += batchResult.units;
      result.unitsDeduplicated += batchResult.deduped;
      result.completionsMarked += batchResult.completions;
      result.cost += batchResult.cost;
      if (batchResult.fatalError) batchHadFatalError = true;
      result.errors.push(...batchResult.errors);
    } else {
      const { groups, cost: classifyCost, errors: classifyErrors } = await runClassificationWithRetry(
        formattedText, allAccountsCtx, indexToEventId, logger,
      );
      result.cost += classifyCost;
      result.errors.push(...classifyErrors);
      if (classifyErrors.length > 0) batchHadFatalError = true;

      // Group by account using message indices
      const accountGroups = new Map<string | null, number[]>();
      for (const group of groups) {
        if (!group.worthExtracting) continue;
        const key = group.accountSlug;
        if (!accountGroups.has(key)) accountGroups.set(key, []);
        accountGroups.get(key)!.push(...group.messageIndices);
      }

      for (const [slug, indices] of accountGroups) {
        // Fix #4: resolve account slug → accountId for proper attribution
        const accountId = slug ? await resolveAccountSlug(slug) : null;
        const accountCtx = accountId ? await loadAccountContext(accountId) : null;
        const openItems = accountId ? await loadOpenItems(accountId) : [];

        // Build sub-set of events for this account
        const indexSet = new Set(indices);
        const subEventIds = new Set<string>();
        for (const [idx, eid] of indexToEventId) {
          if (indexSet.has(idx)) subEventIds.add(eid);
        }
        const accountEvents = events.filter((e) => subEventIds.has(e.id));
        if (accountEvents.length === 0) continue;

        // Re-format just this account's messages with fresh indices
        const { text: accountText, indexToEventId: accountIndexMap } = formatMessagesForPrompt(accountEvents);
        // Use fresh copies per account group to prevent cross-account dedup contamination.
        // Both extractedSoFar and existingForDedup are mutated inside runExtractionWithRetry,
        // so each account group needs its own copy.
        const accountExistingForDedup = [...existingForDedup];
        const accountExtractedSoFar = [...extractedSoFar];
        const batchResult = await runExtractionWithRetry(
          accountText, accountCtx, openItems, channel.channelCategory,
          accountId, channelDbId, visibility, accountExtractedSoFar, accountExistingForDedup, accountIndexMap, logger,
        );
        result.unitsExtracted += batchResult.units;
        result.unitsDeduplicated += batchResult.deduped;
        result.completionsMarked += batchResult.completions;
        result.cost += batchResult.cost;
        if (batchResult.fatalError) batchHadFatalError = true;
        result.errors.push(...batchResult.errors);
      }
    }

    if (!batchHadFatalError) {
      const eventIds = events.map((e) => e.id);
      await db.update(knowledgeEvents).set({ processedAt: new Date() }).where(inArray(knowledgeEvents.id, eventIds));
      result.eventsProcessed += events.length;
    } else {
      logger.error(`Batch ${i + 1} had fatal errors — events NOT marked as processed`);
    }
  }

  return result;
}

// --- Extraction with retry + dedup ---

interface ExtractionResult {
  units: number;
  deduped: number;
  completions: number;
  cost: number;
  fatalError: boolean;
  errors: string[];
}

async function runExtractionWithRetry(
  messages: string,
  account: AccountContext | null,
  openItems: OpenItem[],
  channelCategory: string,
  accountId: string | null,
  channelId: string,
  visibility: string,
  extractedSoFar: ExtractedSummary[],
  existingForDedup: Array<{ content: string; assignee: string | null }>,
  indexToEventId: Map<number, string>,
  logger: Logger,
): Promise<ExtractionResult> {
  let lastError = "";
  let totalCost = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = attempt === 0
      ? buildExtractionPrompt(messages, account, openItems, channelCategory, extractedSoFar)
      : buildRetryPrompt(messages, account, openItems, channelCategory, extractedSoFar, lastError);

    const { output, cost } = await callLLM(prompt, logger);
    totalCost += cost;

    try {
      const json = extractJSON(output);
      const parsed = extractionOutputSchema.parse(JSON.parse(json));

      const { units, completions, errors } = await validateAndResolve(
        parsed, channelId, accountId, visibility, indexToEventId, logger,
      );

      // Dedup against DB + running context
      const combined = [...existingForDedup, ...extractedSoFar.map((s) => ({ content: s.content, assignee: s.assignee }))];
      const { kept, dropped } = dedup(units, combined);

      if (dropped > 0) logger.info(`Deduped ${dropped} units (${kept.length} kept)`);

      if (kept.length > 0) {
        const inserted = await db.insert(knowledgeUnits).values(kept).onConflictDoNothing().returning({
          id: knowledgeUnits.id,
          accountId: knowledgeUnits.accountId,
          unitType: knowledgeUnits.unitType,
          content: knowledgeUnits.content,
          assignee: knowledgeUnits.assignee,
          status: knowledgeUnits.status,
          dueDate: knowledgeUnits.dueDate,
        });
        for (const u of kept) {
          extractedSoFar.push({ type: u.unitType, content: u.content, assignee: u.assignee, status: u.status });
          // Don't push to existingForDedup here — it should remain the DB snapshot.
          // Dedup across retries works via extractedSoFar, which is included in the combined array.
        }

        // Auto-create account actions from actionable knowledge units
        const actionableTypes = new Set<string>(ACTIONABLE_UNIT_TYPES);
        for (const row of inserted) {
          if (actionableTypes.has(row.unitType) && row.accountId) {
            try {
              await createActionFromUnit(row, logger);
            } catch (err) {
              logger.error(`Failed to create action from unit ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }

      logger.info(`Extracted ${kept.length} units, ${completions} completions, ${dropped} deduped, ${errors.length} validation errors`);
      return { units: kept.length, deduped: dropped, completions, cost: totalCost, fatalError: false, errors };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        logger.info(`Extraction failed (attempt ${attempt + 1}), retrying: ${lastError.slice(0, 200)}`);
      } else {
        logger.error(`Extraction failed after ${attempt + 1} attempts: ${lastError.slice(0, 200)}`);
        return { units: 0, deduped: 0, completions: 0, cost: totalCost, fatalError: true, errors: [`extraction: ${lastError.slice(0, 200)}`] };
      }
    }
  }

  return { units: 0, deduped: 0, completions: 0, cost: totalCost, fatalError: true, errors: ["extraction: exhausted retries"] };
}

function buildRetryPrompt(
  messages: string,
  account: AccountContext | null,
  openItems: OpenItem[],
  channelCategory: string,
  extractedSoFar: ExtractedSummary[],
  error: string,
): string {
  const base = buildExtractionPrompt(messages, account, openItems, channelCategory, extractedSoFar);
  return `${base}\n\nIMPORTANT: Your previous attempt failed with this error:\n${error.slice(0, 500)}\n\nPlease fix the JSON output. Ensure all required fields are present, especially sourceMessages (array of integers referencing [msg:N] tags).`;
}

// --- Classification with retry ---

type ClassificationGroup = { accountSlug: string | null; messageIndices: number[]; worthExtracting: boolean };

async function runClassificationWithRetry(
  messages: string,
  allAccounts: AccountContext[],
  _indexToEventId: Map<number, string>,
  logger: Logger,
): Promise<{ groups: ClassificationGroup[]; cost: number; errors: string[] }> {
  const prompt = buildClassificationPrompt(messages, allAccounts);
  let totalCost = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const fullPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nIMPORTANT: Your previous attempt returned invalid JSON. Output ONLY a valid JSON object with a "groups" array.`;

    const { output, cost } = await callLLM(fullPrompt, logger);
    totalCost += cost;

    try {
      const json = extractJSON(output);
      const parsed = classificationOutputSchema.parse(JSON.parse(json));
      // Map classification groups to use messageIndices
      const groups: ClassificationGroup[] = parsed.groups.map((g) => ({
        accountSlug: g.accountSlug,
        messageIndices: g.messageIndices,
        worthExtracting: g.worthExtracting,
      }));
      return { groups, cost: totalCost, errors: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        logger.info(`Classification failed (attempt ${attempt + 1}), retrying: ${msg.slice(0, 200)}`);
      } else {
        logger.error(`Classification failed after ${attempt + 1} attempts: ${msg.slice(0, 200)}`);
        return { groups: [], cost: totalCost, errors: [`classification: ${msg}`] };
      }
    }
  }

  return { groups: [], cost: totalCost, errors: ["classification: exhausted retries"] };
}
