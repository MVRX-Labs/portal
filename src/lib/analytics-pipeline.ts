import { getManagedProfile } from "./managed-profiles";
import { ingestPosts } from "./post-ingestion";
import { generateWeeklyReport, saveWeeklyReport } from "./analytics-report";
import type { WeeklyReportData } from "./analytics-report";
import { buildAnalyticsSlackMessage } from "./analytics-slack";
import { sendAnalyticsSlackMessage } from "./slack";
import { scrapeProfilePosts } from "./engagement-bot";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export interface PipelineResult {
  report: WeeklyReportData;
  postsScraped: number;
  newPosts: number;
  slackSent: boolean;
}

/**
 * Single pipeline: scrape -> ingest -> generate report -> save -> send Slack.
 * Used by both the scheduled trigger task and the manual API endpoint.
 */
export async function runWeeklyReportForProfile(
  profileId: string,
  accountId: string,
  options?: { maxPosts?: number; channelId?: string | null },
): Promise<PipelineResult> {
  const profile = await getManagedProfile(profileId);
  if (!profile) throw new Error(`Profile ${profileId} not found`);
  if (profile.accountId !== accountId) {
    throw new Error(`Profile ${profileId} does not belong to account ${accountId}`);
  }

  // 1. Scrape via Apify
  const { rawPosts } = await scrapeProfilePosts(profile.linkedinUrl, options?.maxPosts ?? 200);

  // 2. Ingest into managed_posts
  const { total, newCount } = await ingestPosts(profileId, accountId, rawPosts, {
    expectedLinkedinSlug: profile.linkedinSlug ?? undefined,
    expectedLinkedinUrl: profile.linkedinUrl,
  });

  // 3. Generate report (diffs against previous report automatically)
  const report = await generateWeeklyReport(profileId);

  // 4. Save
  await saveWeeklyReport(accountId, profileId, report);

  // 5. Send Slack if channel configured
  let slackSent = false;
  let channelId = options?.channelId;
  if (channelId === undefined) {
    const [acct] = await db
      .select({ analyticsSlackChannel: accounts.analyticsSlackChannel })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    channelId = acct?.analyticsSlackChannel ?? null;
  }
  if (channelId) {
    const msg = buildAnalyticsSlackMessage(report);
    await sendAnalyticsSlackMessage(channelId, msg.text, msg.blocks, {
      unfurl_links: msg.unfurl_links,
      unfurl_media: msg.unfurl_media,
    });
    slackSent = true;
  }

  return { report, postsScraped: total, newPosts: newCount, slackSent };
}
