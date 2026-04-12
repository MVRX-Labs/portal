/**
 * Knowledge Hub — Daily Digest Task
 *
 * Runs daily at 9am London time (weekdays).
 * Sends a structured summary of open knowledge units to Tarun + Nitanshu.
 *
 * Can also be triggered on-demand via API.
 */

import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { generateAndSendDigest } from "@/lib/knowledge/digest";
import { sendSlackNotification } from "@/lib/slack";

/**
 * Scheduled daily digest — 9am London, weekdays.
 */
export const knowledgeDigestSchedule = schedules.task({
  id: "knowledge-digest-schedule",
  // cron: { pattern: "0 9 * * 1-5", timezone: "Europe/London" }, // DISABLED

  maxDuration: 300,
  run: async (_payload, { ctx }) => {
    logger.info("Running scheduled daily digest");

    try {
      const result = await generateAndSendDigest(logger);
      logger.info(`Digest complete: ${result.sections} accounts, ${result.messagesSent} messages sent`);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-digest-schedule",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

/**
 * On-demand digest trigger.
 */
export const knowledgeDigestOnDemand = task({
  id: "knowledge-digest-on-demand",
  maxDuration: 300,
  run: async (_payload: Record<string, never>, { ctx }) => {
    logger.info("Running on-demand digest");

    try {
      const result = await generateAndSendDigest(logger);
      logger.info(`Digest complete: ${result.sections} accounts, ${result.messagesSent} messages sent`);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-digest-on-demand",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
