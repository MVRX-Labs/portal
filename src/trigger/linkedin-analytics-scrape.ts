/**
 * Weekly analytics — generates reports + sends Slack.
 *
 * Post scraping is handled by linkedin-sync (every 30 min).
 * This task only generates weekly reports from data already in linkedin_posts.
 *
 * One scheduled task (Monday 7 AM UTC) triggers per-profile report tasks.
 */

import { task, schedules, logger, metadata, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { linkedinProfiles } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { runWeeklyReportForProfile } from "@/lib/analytics-pipeline";
import { sendSlackNotification } from "@/lib/slack";

const analyticsQueue = queue({
  name: "analytics-scrape",
  concurrencyLimit: 2,
});

interface WeeklyAnalyticsPayload {
  accountId: string;
  profileId: string;
}

export const weeklyAnalyticsTask = task({
  id: "weekly-analytics",
  queue: analyticsQueue,
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: WeeklyAnalyticsPayload, { ctx }) => {
    const { accountId, profileId } = payload;

    try {
      logger.info("Starting weekly analytics", { accountId, profileId });
      metadata.set("progress", { step: "Running pipeline", percentage: 10 });

      const result = await runWeeklyReportForProfile(profileId, accountId);

      metadata.set("progress", { step: "Done", percentage: 100 });
      logger.info("Weekly analytics complete", {
        slackSent: result.slackSent,
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Weekly analytics failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "weekly-analytics",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});

export const weeklyAnalyticsScheduler = schedules.task({
  id: "weekly-analytics-scheduler",
  cron: "0 7 * * 1", // Monday 7 AM UTC
  run: async () => {
    logger.info("Starting weekly analytics scheduler");

    const profiles = await db
      .select({
        id: linkedinProfiles.id,
        accountId: linkedinProfiles.accountId,
        displayName: linkedinProfiles.displayName,
      })
      .from(linkedinProfiles)
      .where(and(eq(linkedinProfiles.active, true), eq(linkedinProfiles.analyticsEnabled, true)));

    if (profiles.length === 0) {
      logger.info("No active analytics profiles");
      return { triggered: 0 };
    }

    await weeklyAnalyticsTask.batchTrigger(
      profiles.map((p) => ({
        payload: { accountId: p.accountId, profileId: p.id },
      }))
    );

    logger.info(`Triggered ${profiles.length} weekly analytics tasks`);
    return { triggered: profiles.length };
  },
});
