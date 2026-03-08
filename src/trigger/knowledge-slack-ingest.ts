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

import { schedules, task, logger } from "@trigger.dev/sdk";
import { ingestAllChannels, ingestChannel } from "@/lib/knowledge/ingest";

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
  run: async () => {
    logger.info("Starting scheduled knowledge ingestion");

    const results = await ingestAllChannels(logger);

    const totalNew = results.reduce((sum, r) => sum + r.newMessages + r.newThreadReplies, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

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
  },
});

/**
 * On-demand ingestion — single channel.
 * Triggered via API when you want immediate sync.
 */
export const knowledgeSlackIngestChannel = task({
  id: "knowledge-slack-ingest-channel",
  run: async (payload: { channelDbId: string }) => {
    logger.info(`On-demand ingestion for channel ${payload.channelDbId}`);

    const result = await ingestChannel(payload.channelDbId, logger);

    logger.info(
      `Channel #${result.channelName}: ${result.newMessages} messages, ${result.newThreadReplies} thread replies`,
    );

    return result;
  },
});
