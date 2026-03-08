/**
 * Knowledge Hub — Slack Ingestion Task
 *
 * Scheduled task that polls registered Slack channels for new messages,
 * resolves threads and media, and stores raw events in the database.
 *
 * Runs every 30 minutes during working hours (Mon–Fri, 8am–10pm London).
 * Can also be triggered manually via API for immediate ingestion.
 *
 * Pattern: identical to calendar-sync (scheduled polling with cursor tracking).
 */

import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import { ingestAllChannels, ingestChannel } from "@/lib/knowledge/ingest";
import { sendSlackNotification } from "@/lib/slack";

/**
 * Scheduled ingestion — all active channels.
 * Runs every 30 minutes, Mon–Fri, 8am–10pm London.
 */
export const knowledgeSlackIngestScheduled = schedules.task({
  id: "knowledge-slack-ingest-scheduled",
  cron: {
    pattern: "*/30 8-22 * * 1-5",
    timezone: "Europe/London",
  },
  run: async (_payload, { ctx }) => {
    logger.info("Starting scheduled knowledge ingestion");

    try {
      const results = await ingestAllChannels(logger);

      const totalNew = results.reduce((sum, r) => sum + r.newMessages + r.newThreadReplies, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      if (totalErrors > 0) {
        const errorSummary = results
          .filter((r) => r.errors.length > 0)
          .map((r) => `#${r.channelName}: ${r.errors.join(", ")}`)
          .join("; ");
        await sendSlackNotification({
          tool: "knowledge-slack-ingest-scheduled",
          userName: "system",
          error: `Partial failure (${totalErrors} errors): ${errorSummary}`.slice(0, 500),
          runId: ctx.run.id,
        });
      }

      logger.info(
        `Ingestion complete: ${totalNew} new events across ${results.length} channels, ${totalErrors} errors`,
      );

      return {
        channels: results.map((r) => ({
          name: r.channelName,
          newMessages: r.newMessages,
          newThreadReplies: r.newThreadReplies,
          skipped: r.skipped,
          errors: r.errors.length,
        })),
        totalNew,
        totalErrors,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-slack-ingest-scheduled",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

/**
 * On-demand ingestion — single channel.
 * Triggered via API when you want immediate sync.
 */
export const knowledgeSlackIngestChannel = task({
  id: "knowledge-slack-ingest-channel",
  run: async (payload: { channelDbId: string }, { ctx }) => {
    logger.info(`On-demand ingestion for channel ${payload.channelDbId}`);

    try {
      const result = await ingestChannel(payload.channelDbId, logger);

      logger.info(
        `Channel #${result.channelName}: ${result.newMessages} messages, ${result.newThreadReplies} thread replies`,
      );

      if (result.errors.length > 0) {
        await sendSlackNotification({
          tool: "knowledge-slack-ingest-channel",
          userName: "system",
          error: `#${result.channelName}: ${result.errors.join(", ")}`.slice(0, 500),
          runId: ctx.run.id,
        });
      }

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-slack-ingest-channel",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
