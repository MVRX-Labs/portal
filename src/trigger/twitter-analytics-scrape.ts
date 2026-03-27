/**
 * Twitter weekly analytics — generates reports + sends Slack.
 *
 * Post scraping is handled by twitter-sync (every 4h).
 * This task only generates weekly reports from data already in twitter_posts.
 *
 * One scheduled task (Monday 7:30 AM UTC) triggers per-profile report tasks.
 */

import { task, schedules, logger, metadata, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { twitterProfiles, twitterPosts, twitterPostSnapshots, accounts } from "@/lib/schema";
import { eq, and, gte } from "drizzle-orm";
import { sendSlackNotification, sendAnalyticsSlackMessage } from "@/lib/slack";

const twitterAnalyticsQueue = queue({
  name: "twitter-analytics",
  concurrencyLimit: 2,
});

interface TwitterWeeklyAnalyticsPayload {
  accountId: string;
  profileId: string;
}

export const twitterWeeklyAnalyticsTask = task({
  id: "twitter-weekly-analytics",
  queue: twitterAnalyticsQueue,
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: TwitterWeeklyAnalyticsPayload, { ctx }) => {
    const { accountId, profileId } = payload;

    try {
      logger.info("Starting Twitter weekly analytics", { accountId, profileId });
      metadata.set("progress", { step: "Running pipeline", percentage: 10 });

      // Load profile
      const [profile] = await db.select().from(twitterProfiles).where(eq(twitterProfiles.id, profileId));
      if (!profile) {
        logger.warn(`Twitter profile ${profileId} not found`);
        return { skipped: true };
      }

      // Load account for Slack channel
      const [account] = await db
        .select({ twitterAnalyticsSlackChannel: accounts.twitterAnalyticsSlackChannel })
        .from(accounts)
        .where(eq(accounts.id, accountId));

      const channelId = account?.twitterAnalyticsSlackChannel;
      if (!channelId) {
        logger.info("No Twitter analytics Slack channel configured, skipping report");
        return { slackSent: false, reason: "no_channel" };
      }

      // Get posts from last 7 days
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
      const recentPosts = await db
        .select()
        .from(twitterPosts)
        .where(and(eq(twitterPosts.profileId, profileId), gte(twitterPosts.postedAt, oneWeekAgo)));

      if (recentPosts.length === 0) {
        logger.info("No tweets in the last week");
        return { slackSent: false, reason: "no_posts" };
      }

      // Calculate totals
      const totals = recentPosts.reduce(
        (acc, p) => ({
          likes: acc.likes + p.likesCount,
          retweets: acc.retweets + p.retweetsCount,
          quotes: acc.quotes + p.quotesCount,
          replies: acc.replies + p.repliesCount,
          bookmarks: acc.bookmarks + p.bookmarksCount,
          views: acc.views + p.viewsCount,
        }),
        { likes: 0, retweets: 0, quotes: 0, replies: 0, bookmarks: 0, views: 0 }
      );

      const totalEngagement = totals.likes + totals.retweets + totals.quotes + totals.replies + totals.bookmarks;

      // Build Slack message
      const blocks: Record<string, unknown>[] = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Twitter Weekly Report — ${profile.displayName || profile.twitterHandle || "Unknown"}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `*${recentPosts.length} tweets* this week`,
              `*${totalEngagement.toLocaleString()}* total engagement`,
              `*${totals.views.toLocaleString()}* views`,
              "",
              `Likes: ${totals.likes} | Retweets: ${totals.retweets} | Quotes: ${totals.quotes} | Replies: ${totals.replies} | Bookmarks: ${totals.bookmarks}`,
            ].join("\n"),
          },
        },
      ];

      // Top posts by engagement
      const sorted = [...recentPosts]
        .map((p) => ({
          ...p,
          totalEngagement: p.likesCount + p.retweetsCount + p.quotesCount + p.repliesCount + p.bookmarksCount,
        }))
        .sort((a, b) => b.totalEngagement - a.totalEngagement)
        .slice(0, 3);

      if (sorted.length > 0) {
        blocks.push({ type: "divider" });
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Top tweets:*\n${sorted
              .map((p, i) => {
                const snippet =
                  p.content.length > 80
                    ? p.content.slice(0, 80).replace(/\n+/g, " ") + "..."
                    : p.content.replace(/\n+/g, " ");
                const link = p.tweetUrl ? `<${p.tweetUrl}|View>` : "";
                return `${i + 1}. ${snippet} — ${p.totalEngagement} eng, ${p.viewsCount.toLocaleString()} views ${link}`;
              })
              .join("\n")}`,
          },
        });
      }

      // Send to all configured channels
      const channelIds = channelId
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      for (const ch of channelIds) {
        await sendAnalyticsSlackMessage(
          ch,
          `Twitter Weekly Report — ${profile.displayName || profile.twitterHandle}`,
          blocks
        );
      }

      metadata.set("progress", { step: "Done", percentage: 100 });
      logger.info("Twitter weekly analytics complete", { slackSent: true });

      return { slackSent: true, postCount: recentPosts.length, totalEngagement };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Twitter weekly analytics failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "twitter-weekly-analytics",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});

export const twitterWeeklyAnalyticsScheduler = schedules.task({
  id: "twitter-weekly-analytics-scheduler",
  cron: "30 7 * * 1", // Monday 7:30 AM UTC
  run: async () => {
    logger.info("Starting Twitter weekly analytics scheduler");

    const profiles = await db
      .select({
        id: twitterProfiles.id,
        accountId: twitterProfiles.accountId,
        displayName: twitterProfiles.displayName,
      })
      .from(twitterProfiles)
      .where(and(eq(twitterProfiles.active, true), eq(twitterProfiles.analyticsEnabled, true)));

    if (profiles.length === 0) {
      logger.info("No active Twitter analytics profiles");
      return { triggered: 0 };
    }

    await twitterWeeklyAnalyticsTask.batchTrigger(
      profiles.map((p) => ({
        payload: { accountId: p.accountId, profileId: p.id },
      }))
    );

    logger.info(`Triggered ${profiles.length} Twitter weekly analytics tasks`);
    return { triggered: profiles.length };
  },
});
