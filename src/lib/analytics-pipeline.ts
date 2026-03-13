import { getLinkedinProfile } from "./linkedin-profiles";
import { generateWeeklyReport, getWeekStart, saveWeeklyReport } from "./analytics-report";
import type { WeeklyReportData } from "./analytics-report";
import { buildAnalyticsSlackMessage } from "./analytics-slack";
import { sendAnalyticsSlackMessage } from "./slack";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export interface PipelineResult {
  report: WeeklyReportData;
  slackSent: boolean;
}

/**
 * Generate a weekly analytics report for a profile and send to Slack.
 *
 * Post scraping is handled by linkedin-sync — this pipeline only generates
 * the report from data already in linkedin_posts.
 */
export async function runWeeklyReportForProfile(
  profileId: string,
  accountId: string,
  options?: { channelId?: string | null }
): Promise<PipelineResult> {
  const profile = await getLinkedinProfile(profileId);
  if (!profile) throw new Error(`Profile ${profileId} not found`);
  if (profile.accountId !== accountId) {
    throw new Error(`Profile ${profileId} does not belong to account ${accountId}`);
  }

  // 1. Generate report for the previous week (the one that just ended)
  const previousWeekStart = getWeekStart();
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const report = await generateWeeklyReport(profileId, previousWeekStart);

  // 2. Save
  await saveWeeklyReport(accountId, profileId, report);

  // 3. Send Slack if channel configured
  let slackSent = false;
  let channelId = options?.channelId;
  if (channelId === undefined) {
    const [acct] = await db
      .select({ analyticsSlackChannel: accounts.analyticsSlackChannel })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    channelId = acct?.analyticsSlackChannel ?? null;
  }
  if (channelId) {
    const channelIds = channelId
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const msg = buildAnalyticsSlackMessage(report);
    for (const ch of channelIds) {
      await sendAnalyticsSlackMessage(ch, msg.text, msg.blocks, {
        unfurl_links: msg.unfurl_links,
        unfurl_media: msg.unfurl_media,
      });
    }
    slackSent = true;
  }

  return { report, slackSent };
}
