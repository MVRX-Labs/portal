/**
 * Knowledge Hub — Normalisation Task
 *
 * Processes raw knowledge events through LLM extraction to produce
 * typed knowledge units (action items, decisions, etc.).
 *
 * Two-stage pipeline:
 *   Client channels → direct extraction (account is known)
 *   General channels → classify by account first, then extract per-account
 *
 * Can be triggered after ingestion or on-demand.
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { knowledgeChannels } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { normaliseChannel } from "@/lib/knowledge/normaliser";
import { clearUserRegistryCache, setUserRegistryLogger } from "@/lib/knowledge/user-registry";
import { sendSlackNotification } from "@/lib/slack";

/**
 * Normalise a single channel's unprocessed events.
 */
export const knowledgeNormaliseChannel = task({
  id: "knowledge-normalise-channel",
  maxDuration: 300, // 5 min — LLM calls can take time
  retry: { maxAttempts: 2 },
  run: async (payload: { channelDbId: string }, { ctx }) => {
    logger.info(`Normalising channel ${payload.channelDbId}`);
    clearUserRegistryCache();
    setUserRegistryLogger(logger);

    try {
      const result = await normaliseChannel(payload.channelDbId, logger);

      logger.info(
        `#${result.channelName}: ${result.eventsProcessed} events → ${result.unitsExtracted} units, ` +
          `${result.completionsMarked} completions, $${result.cost.toFixed(4)}, ${result.errors.length} errors`,
      );

      // Only send Slack alerts for fatal errors, not per-unit validation warnings
      if (result.errors.some((e) => e.startsWith("extraction:") || e.startsWith("classification:"))) {
        await sendSlackNotification({
          tool: "knowledge-normalise-channel",
          userName: "system",
          error: `#${result.channelName}: ${result.errors.filter((e) => e.startsWith("extraction:") || e.startsWith("classification:")).join("; ")}`.slice(0, 500),
          runId: ctx.run.id,
        });
      }

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-normalise-channel",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

/**
 * Normalise all active channels — delegates to per-channel child tasks.
 */
export const knowledgeNormaliseAll = task({
  id: "knowledge-normalise-all",
  maxDuration: 600, // 10 min for orchestration
  retry: { maxAttempts: 1 },
  run: async (_payload: Record<string, never>, { ctx }) => {
    logger.info("Normalising all active channels");

    try {
      const channels = await db
        .select({ id: knowledgeChannels.id, name: knowledgeChannels.slackChannelName })
        .from(knowledgeChannels)
        .where(eq(knowledgeChannels.active, true));

      if (channels.length === 0) {
        logger.info("No active channels to normalise");
        return { channels: [], totalUnits: 0, totalCost: 0, totalErrors: 0 };
      }

      // Delegate to per-channel child tasks for proper timeout/retry per channel
      const batchItems = channels.map((ch) => ({ payload: { channelDbId: ch.id } }));
      const batch = await knowledgeNormaliseChannel.batchTriggerAndWait(batchItems);

      let totalUnits = 0;
      let totalCost = 0;
      let totalErrors = 0;
      const channelResults = [];
      const failedChannels: string[] = [];

      for (let i = 0; i < batch.runs.length; i++) {
        const run = batch.runs[i];
        const channelName = channels[i].name;
        if (run.ok) {
          const r = run.output;
          channelResults.push(r);
          totalUnits += r.unitsExtracted;
          totalCost += r.cost;
          totalErrors += r.errors.length;
        } else {
          failedChannels.push(channelName);
          totalErrors++;
        }
      }

      logger.info(`Normalisation complete: ${totalUnits} units, $${totalCost.toFixed(4)}, ${totalErrors} errors`);

      if (failedChannels.length > 0) {
        await sendSlackNotification({
          tool: "knowledge-normalise-all",
          userName: "system",
          error: `Channels failed: ${failedChannels.join(", ")}`.slice(0, 500),
          runId: ctx.run.id,
        });
      }

      return { channels: channelResults, totalUnits, totalCost, totalErrors };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-normalise-all",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
