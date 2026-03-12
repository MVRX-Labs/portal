/**
 * Knowledge Hub — Account State Synthesis Task
 *
 * Scheduled weekly on Monday 8am London.
 * Synthesises knowledge units into per-account state docs (brief, open_items, activity_log).
 *
 * Can also be triggered on-demand via API.
 */

import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { synthesiseAccountState, synthesiseAllAccounts } from "@/lib/knowledge/state-synthesis";
import { sendSlackNotification } from "@/lib/slack";

/**
 * Scheduled weekly synthesis — Monday 8am London.
 */
export const knowledgeStateSynthesisSchedule = schedules.task({
  id: "knowledge-state-synthesis-schedule",
  cron: { pattern: "0 8 * * 1", timezone: "Europe/London" },
  maxDuration: 600,
  run: async (_payload, { ctx }) => {
    logger.info("Running scheduled state synthesis");

    try {
      const result = await synthesiseAllAccounts(logger);
      logger.info(
        `Synthesis complete: ${result.results.length} accounts, $${result.totalCost.toFixed(4)}, ${result.errors} errors`,
      );

      if (result.errors > 0) {
        const failed = result.results.filter((r) => r.error).map((r) => r.accountName);
        await sendSlackNotification({
          tool: "knowledge-state-synthesis-schedule",
          userName: "system",
          error: `Failed accounts: ${failed.join(", ")}`.slice(0, 500),
          runId: ctx.run.id,
        });
      }

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-state-synthesis-schedule",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

/**
 * On-demand synthesis — single account or all.
 */
export const knowledgeStateSynthesisOnDemand = task({
  id: "knowledge-state-synthesis-on-demand",
  maxDuration: 600,
  run: async (payload: { accountId?: string }, { ctx }) => {
    logger.info(`Running on-demand state synthesis${payload.accountId ? ` for ${payload.accountId}` : " for all accounts"}`);

    try {
      if (payload.accountId) {
        const result = await synthesiseAccountState(payload.accountId, logger);
        if (result.error) {
          await sendSlackNotification({
            tool: "knowledge-state-synthesis-on-demand",
            userName: "system",
            error: `${result.accountName}: ${result.error}`.slice(0, 500),
            runId: ctx.run.id,
          });
        }
        return result;
      }

      const result = await synthesiseAllAccounts(logger);
      if (result.errors > 0) {
        const failed = result.results.filter((r) => r.error).map((r) => r.accountName);
        await sendSlackNotification({
          tool: "knowledge-state-synthesis-on-demand",
          userName: "system",
          error: `Failed accounts: ${failed.join(", ")}`.slice(0, 500),
          runId: ctx.run.id,
        });
      }
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-state-synthesis-on-demand",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
