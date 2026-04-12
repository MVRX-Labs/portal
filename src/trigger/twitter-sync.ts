/**
 * twitter-sync: Twitter/X profile sync.
 *
 * Scrapes all active twitter_profiles every 4 hours.
 * Handles tweets, snapshots, replies, engagers, outbound Slack cards,
 * and unreplied reply alerts.
 */

import { schedules, task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import {
  twitterProfiles,
  twitterPosts,
  twitterPostSnapshots,
  twitterPostReplies,
  twitterPostEngagements,
  twitterSyncRuns,
  accounts,
} from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import {
  scrapeProfileTweets,
  normalizeTweet,
  extractAuthorName,
  extractHandle,
  sendTweetToSlack,
  scrapeTweetReplies,
  scrapeTweetRetweeters,
} from "@/lib/twitter-engagement-bot";
import { sendSlackNotification, sendAnalyticsSlackMessage } from "@/lib/slack";
import { twitterLeadUpsertTask } from "./twitter-lead-upsert";
import { isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TWEETS_PER_SYNC = 10;
const OUTBOUND_MAX_AGE_DAYS = 1;
const REPLY_SCRAPE_MAX_AGE_DAYS = 3;

/** Early engager window: 5–8 hours after posting */
const EARLY_WINDOW_MIN_H = 5;
const EARLY_WINDOW_MAX_H = 8;

/** Late engager window: 72–75 hours after posting */
const LATE_WINDOW_MIN_H = 72;
const LATE_WINDOW_MAX_H = 75;

const twitterSyncQueue = queue({
  name: "twitter-sync",
  concurrencyLimit: 3,
});

// ---------------------------------------------------------------------------
// Scheduler — every 4 hours
// ---------------------------------------------------------------------------

export const twitterSyncScheduler = schedules.task({
  id: "twitter-sync-scheduler",
  // cron: "15 */4 * * *",
  run: async (_payload, { ctx }) => {
    try {
      const profiles = await db
        .select({ id: twitterProfiles.id, accountId: twitterProfiles.accountId })
        .from(twitterProfiles)
        .where(
          and(
            eq(twitterProfiles.active, true),
            or(
              eq(twitterProfiles.inboundEnabled, true),
              eq(twitterProfiles.analyticsEnabled, true),
              eq(twitterProfiles.outboundEnabled, true)
            )
          )
        );

      if (profiles.length === 0) {
        logger.info("No active twitter profiles to sync");
        return { profileCount: 0 };
      }

      await twitterSyncProfileTask.batchTrigger(
        profiles.map((p) => ({
          payload: { profileId: p.id, accountId: p.accountId },
        }))
      );

      logger.info(`Triggered sync for ${profiles.length} Twitter profiles`);
      return { profileCount: profiles.length };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "twitter-sync-scheduler",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// Per-profile sync task
// ---------------------------------------------------------------------------

export const twitterSyncProfileTask = task({
  id: "twitter-sync-profile",
  queue: twitterSyncQueue,
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async (payload: { profileId: string; accountId: string }, { ctx }) => {
    const { profileId, accountId } = payload;

    const [profile] = await db.select().from(twitterProfiles).where(eq(twitterProfiles.id, profileId));

    if (!profile) {
      logger.warn(`Twitter profile ${profileId} not found, skipping`);
      return { skipped: true };
    }

    const [syncRun] = await db
      .insert(twitterSyncRuns)
      .values({
        profileId,
        accountId,
        status: "running",
        triggerRunId: ctx.run.id,
      })
      .returning();

    try {
      // Step 1: Scrape recent tweets via Apify
      const log = (msg: string, extra?: Record<string, unknown>) => logger.info(msg, extra);
      logger.info(`Scraping tweets for ${profile.displayName || profile.twitterUrl}`);
      const { runId: apifyRunId, rawTweets } = await scrapeProfileTweets(
        profile.twitterUrl,
        MAX_TWEETS_PER_SYNC,
        undefined,
        log
      );

      await db.update(twitterSyncRuns).set({ apifyRunId }).where(eq(twitterSyncRuns.id, syncRun.id));

      // Step 2: Normalize and filter (skip pure retweets)
      const normalizedTweets = rawTweets
        .map((raw) => normalizeTweet(raw))
        .filter((t): t is NonNullable<typeof t> => t !== null && t.tweetType !== "retweet");

      // Deduplicate by external tweet ID
      const tweetsByExternalId = new Map(normalizedTweets.map((t) => [t.externalTweetId, t]));
      const tweets = Array.from(tweetsByExternalId.values());
      logger.info(`Normalized ${tweets.length} tweets from ${rawTweets.length} raw items`);

      // Step 3: Fetch existing tweets
      const existingTweets = await db.select().from(twitterPosts).where(eq(twitterPosts.profileId, profileId));
      const existingByExternalId = new Map(existingTweets.map((t) => [t.externalTweetId, t]));

      // Auto-populate displayName from first tweet's author if missing
      if (!profile.displayName && rawTweets.length > 0) {
        const authorName = extractAuthorName(rawTweets[0]);
        if (authorName) {
          await db
            .update(twitterProfiles)
            .set({ displayName: authorName, updatedAt: new Date() })
            .where(eq(twitterProfiles.id, profileId));
        }
      }

      // Auto-populate handle if missing
      if (!profile.twitterHandle) {
        const handle = extractHandle(profile.twitterUrl);
        if (handle) {
          await db
            .update(twitterProfiles)
            .set({ twitterHandle: handle, updatedAt: new Date() })
            .where(eq(twitterProfiles.id, profileId));
        }
      }

      // Step 4: Upsert tweets and create snapshots
      let newCount = 0;
      const outboundCutoff = new Date(Date.now() - OUTBOUND_MAX_AGE_DAYS * 24 * 3_600_000);
      const upsertedTweets: Array<{
        id: string;
        tweetUrl: string;
        postedAt: Date | null;
        earlyEngagersScrapedAt: Date | null;
        lateEngagersScrapedAt: Date | null;
      }> = [];

      for (const t of tweets) {
        const existing = existingByExternalId.get(t.externalTweetId);

        let postId: string;
        let earlyScraped: Date | null = null;
        let lateScraped: Date | null = null;

        if (existing) {
          await db
            .update(twitterPosts)
            .set({
              likesCount: t.likesCount,
              retweetsCount: t.retweetsCount,
              quotesCount: t.quotesCount,
              repliesCount: t.repliesCount,
              bookmarksCount: t.bookmarksCount,
              viewsCount: t.viewsCount,
              content: t.content || existing.content,
              tweetUrl: t.tweetUrl || existing.tweetUrl,
              postedAt: t.postedAt ?? existing.postedAt,
            })
            .where(eq(twitterPosts.id, existing.id));
          postId = existing.id;
          earlyScraped = existing.earlyEngagersScrapedAt;
          lateScraped = existing.lateEngagersScrapedAt;
        } else {
          const isRecentEnough = !t.postedAt || t.postedAt >= outboundCutoff;
          const engagementStatus = profile.outboundEnabled && isRecentEnough ? "pending" : null;

          const [inserted] = await db
            .insert(twitterPosts)
            .values({
              profileId,
              accountId,
              externalTweetId: t.externalTweetId,
              content: t.content,
              tweetUrl: t.tweetUrl,
              tweetType: t.tweetType,
              likesCount: t.likesCount,
              retweetsCount: t.retweetsCount,
              quotesCount: t.quotesCount,
              repliesCount: t.repliesCount,
              bookmarksCount: t.bookmarksCount,
              viewsCount: t.viewsCount,
              postedAt: t.postedAt,
              engagementStatus,
            })
            .returning({ id: twitterPosts.id });
          postId = inserted.id;
          newCount++;
        }

        // Create snapshot
        await db.insert(twitterPostSnapshots).values({
          postId,
          profileId,
          accountId,
          likesCount: t.likesCount,
          retweetsCount: t.retweetsCount,
          quotesCount: t.quotesCount,
          repliesCount: t.repliesCount,
          bookmarksCount: t.bookmarksCount,
          viewsCount: t.viewsCount,
        });

        upsertedTweets.push({
          id: postId,
          tweetUrl: t.tweetUrl,
          postedAt: t.postedAt,
          earlyEngagersScrapedAt: earlyScraped,
          lateEngagersScrapedAt: lateScraped,
        });
      }

      logger.info(`Upserted ${tweets.length} tweets (${newCount} new), created ${tweets.length} snapshots`);

      // Step 5: Scrape replies on tweets ≤3 days old
      const now = Date.now();
      const replyCutoff = now - REPLY_SCRAPE_MAX_AGE_DAYS * 24 * 3_600_000;
      const replyEligible = upsertedTweets.filter((t) => t.postedAt && t.postedAt.getTime() >= replyCutoff);

      if (replyEligible.length > 0) {
        logger.info(`Scraping replies on ${replyEligible.length} tweets (≤${REPLY_SCRAPE_MAX_AGE_DAYS}d old)`);
        const ownerHandle = profile.twitterHandle || extractHandle(profile.twitterUrl);
        for (const tweet of replyEligible) {
          try {
            await scrapeAndUpsertReplies(tweet.id, profileId, accountId, tweet.tweetUrl, ownerHandle, log);
          } catch (err) {
            logger.warn(
              `Failed to scrape replies for tweet ${tweet.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // Step 6: Scrape engagers at windowed intervals
      let engagerWindowsScraped = 0;
      for (const tweet of upsertedTweets) {
        if (!tweet.postedAt) continue;
        const ageHours = (now - tweet.postedAt.getTime()) / 3_600_000;

        if (ageHours >= EARLY_WINDOW_MIN_H && ageHours <= EARLY_WINDOW_MAX_H && !tweet.earlyEngagersScrapedAt) {
          try {
            logger.info(`Early window scrape for tweet ${tweet.id} (${ageHours.toFixed(1)}h old)`);
            await scrapeAndUpsertEngagers(tweet.id, profileId, accountId, tweet.tweetUrl, "early", tweet.postedAt, log);
            await db
              .update(twitterPosts)
              .set({ earlyEngagersScrapedAt: new Date() })
              .where(eq(twitterPosts.id, tweet.id));
            engagerWindowsScraped++;
          } catch (err) {
            logger.warn(
              `Failed early engager scrape for tweet ${tweet.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        if (ageHours >= LATE_WINDOW_MIN_H && ageHours <= LATE_WINDOW_MAX_H && !tweet.lateEngagersScrapedAt) {
          try {
            logger.info(`Late window scrape for tweet ${tweet.id} (${ageHours.toFixed(1)}h old)`);
            await scrapeAndUpsertEngagers(tweet.id, profileId, accountId, tweet.tweetUrl, "late", tweet.postedAt, log);
            await db
              .update(twitterPosts)
              .set({ lateEngagersScrapedAt: new Date() })
              .where(eq(twitterPosts.id, tweet.id));
            engagerWindowsScraped++;
          } catch (err) {
            logger.warn(
              `Failed late engager scrape for tweet ${tweet.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // Step 6b: Trigger lead upsert for inbound profiles when engagers were scraped
      if (profile.inboundEnabled && engagerWindowsScraped > 0) {
        try {
          await twitterLeadUpsertTask.trigger({
            profileId,
            accountId,
            contactId: profile.contactId,
            scrapeWindow: "early", // Use the last scraped window
          });
          logger.info(
            `Triggered Twitter lead upsert for profile ${profileId} (${engagerWindowsScraped} windows scraped)`
          );
        } catch (err) {
          logger.warn(`Failed to trigger Twitter lead upsert: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 7: Outbound engagement — send new tweets to Slack
      let slackSent = 0;
      if (profile.outboundEnabled) {
        const [account] = await db
          .select({ twitterEngagementSlackChannel: accounts.twitterEngagementSlackChannel })
          .from(accounts)
          .where(eq(accounts.id, accountId));

        const channelId = account?.twitterEngagementSlackChannel;
        if (channelId) {
          const claimed = await db
            .update(twitterPosts)
            .set({ engagementStatus: "sending" })
            .where(and(eq(twitterPosts.profileId, profileId), eq(twitterPosts.engagementStatus, "pending")))
            .returning();

          const [freshProfile] = await db.select().from(twitterProfiles).where(eq(twitterProfiles.id, profileId));

          for (const tweet of claimed) {
            try {
              const ts = await sendTweetToSlack(
                channelId,
                {
                  id: tweet.id,
                  content: tweet.content,
                  tweetUrl: tweet.tweetUrl,
                  likesCount: tweet.likesCount,
                  retweetsCount: tweet.retweetsCount,
                  repliesCount: tweet.repliesCount,
                },
                { displayName: freshProfile?.displayName || profile.displayName || "" }
              );
              await db
                .update(twitterPosts)
                .set({ engagementStatus: "sent_to_slack", slackMessageTs: ts })
                .where(and(eq(twitterPosts.id, tweet.id), eq(twitterPosts.engagementStatus, "sending")));
              slackSent++;
            } catch (err) {
              logger.warn(
                `Failed to send Slack card for tweet ${tweet.id}: ${err instanceof Error ? err.message : String(err)}`
              );
              await db
                .update(twitterPosts)
                .set({ engagementStatus: "pending" })
                .where(and(eq(twitterPosts.id, tweet.id), eq(twitterPosts.engagementStatus, "sending")));
            }
          }

          if (claimed.length > 0) {
            logger.info(`Outbound: sent ${slackSent}/${claimed.length} tweets to Slack`);
          }
        }
      }

      // Step 8: Unreplied reply alerts
      if (profile.analyticsEnabled) {
        try {
          const alertsSent = await sendUnrepliedReplyAlerts(
            profileId,
            accountId,
            profile.displayName || profile.twitterUrl
          );
          if (alertsSent > 0) {
            logger.info(`Sent ${alertsSent} unreplied reply alert(s)`);
          }
        } catch (err) {
          logger.warn(`Failed to send unreplied reply alerts: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 9: Update profile sync state
      await db
        .update(twitterProfiles)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(twitterProfiles.id, profileId));

      // Step 10: Mark sync run complete
      await db
        .update(twitterSyncRuns)
        .set({
          status: "completed",
          postsFound: tweets.length,
          postsNew: newCount,
          completedAt: new Date(),
        })
        .where(eq(twitterSyncRuns.id, syncRun.id));

      logger.info(
        `Sync complete for ${profile.displayName || profile.twitterUrl}: ${tweets.length} tweets (${newCount} new)`
      );

      return {
        postsFound: tweets.length,
        postsNew: newCount,
        repliesScraped: replyEligible.length,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`twitter-sync-profile failed for ${profile.displayName || profileId}: ${errMsg}`);

      try {
        await db
          .update(twitterSyncRuns)
          .set({
            status: "failed",
            errorMessage: errMsg,
            completedAt: new Date(),
          })
          .where(eq(twitterSyncRuns.id, syncRun.id));
      } catch (dbErr) {
        logger.error(`Failed to update sync run status: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }

      try {
        await sendSlackNotification({
          tool: "twitter-sync-profile",
          userName: "system",
          error: `Profile ${profile.displayName || profileId}: ${errMsg}`,
          runId: ctx.run.id,
        });
      } catch (slackErr) {
        logger.error(
          `Failed to send Slack notification: ${slackErr instanceof Error ? slackErr.message : String(slackErr)}`
        );
      }

      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function scrapeAndUpsertReplies(
  postId: string,
  profileId: string,
  accountId: string,
  tweetUrl: string,
  ownerHandle: string | null,
  log?: (message: string, extra?: Record<string, unknown>) => void
) {
  const replies = await scrapeTweetReplies(tweetUrl, undefined, log);
  if (replies.length === 0) return;

  logger.info(`Upserting ${replies.length} replies for tweet ${postId}`);

  for (const r of replies) {
    const isOwner = ownerHandle ? r.authorHandle?.toLowerCase() === ownerHandle.toLowerCase() : false;

    await db
      .insert(twitterPostReplies)
      .values({
        postId,
        profileId,
        accountId,
        tweetId: r.tweetId,
        authorName: r.authorName,
        authorHandle: r.authorHandle,
        authorBio: r.authorBio,
        authorTwitterUrl: r.authorTwitterUrl,
        replyText: r.replyText,
        replyUrl: r.replyUrl,
        repliedAt: r.repliedAt,
        isReply: r.isReply,
        parentReplyId: r.parentReplyId,
        repliedToByOwner: false,
      })
      .onConflictDoUpdate({
        target: [twitterPostReplies.postId, twitterPostReplies.tweetId],
        set: {
          replyText: r.replyText,
          authorBio: r.authorBio,
          replyUrl: r.replyUrl,
        },
      });

    // If this is the owner replying, mark parent replies as replied-to
    if (isOwner) {
      await db
        .update(twitterPostReplies)
        .set({ repliedToByOwner: true })
        .where(
          and(
            eq(twitterPostReplies.postId, postId),
            eq(twitterPostReplies.isReply, false),
            eq(twitterPostReplies.repliedToByOwner, false)
          )
        );
    }
  }
}

async function scrapeAndUpsertEngagers(
  postId: string,
  profileId: string,
  accountId: string,
  tweetUrl: string,
  window: "early" | "late",
  engagedAt: Date,
  log?: (message: string, extra?: Record<string, unknown>) => void
) {
  // NOTE: Likes (favoriters) are not scrapable — Twitter made them private in 2024.
  // We only scrape retweeters. Likes are tracked via aggregate favorite_count on the tweet.
  const retweeters = await scrapeTweetRetweeters(tweetUrl, undefined, log, engagedAt);

  if (retweeters.length === 0) return;

  logger.info(`Upserting ${retweeters.length} retweeters for tweet ${postId} [${window}]`);

  const allEngagers = retweeters;

  for (const e of allEngagers) {
    await db
      .insert(twitterPostEngagements)
      .values({
        postId,
        profileId,
        accountId,
        authorName: e.authorName,
        authorHandle: e.authorHandle,
        authorTwitterUrl: e.authorTwitterUrl,
        authorBio: e.authorBio,
        authorCompany: e.authorCompany,
        authorProfileImage: e.authorProfileImage,
        engagementType: e.engagementType,
        engagedAt: e.engagedAt,
        scrapeWindow: window,
      })
      .onConflictDoNothing();
  }
}

async function sendUnrepliedReplyAlerts(
  profileId: string,
  accountId: string,
  profileDisplayName: string
): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000);

  const unreplied = await db
    .select({
      id: twitterPostReplies.id,
      postId: twitterPostReplies.postId,
      authorName: twitterPostReplies.authorName,
      authorHandle: twitterPostReplies.authorHandle,
      authorTwitterUrl: twitterPostReplies.authorTwitterUrl,
      replyText: twitterPostReplies.replyText,
      replyUrl: twitterPostReplies.replyUrl,
      repliedAt: twitterPostReplies.repliedAt,
    })
    .from(twitterPostReplies)
    .where(
      and(
        eq(twitterPostReplies.profileId, profileId),
        eq(twitterPostReplies.repliedToByOwner, false),
        eq(twitterPostReplies.isReply, false),
        isNull(twitterPostReplies.notifiedAt)
      )
    );

  const recent = unreplied.filter((r) => r.repliedAt && r.repliedAt >= sevenDaysAgo);
  if (recent.length === 0) return 0;

  const [account] = await db
    .select({ twitterAnalyticsSlackChannel: accounts.twitterAnalyticsSlackChannel })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const channelId = account?.twitterAnalyticsSlackChannel;
  if (!channelId) return 0;

  // Group by tweet
  const byPost = new Map<string, typeof recent>();
  for (const r of recent) {
    const existing = byPost.get(r.postId) || [];
    existing.push(r);
    byPost.set(r.postId, existing);
  }

  // Load tweet details
  const postIds = Array.from(byPost.keys());
  const allProfileTweets = await db
    .select({ id: twitterPosts.id, content: twitterPosts.content, tweetUrl: twitterPosts.tweetUrl })
    .from(twitterPosts)
    .where(eq(twitterPosts.profileId, profileId));
  const postMap = new Map(
    allProfileTweets
      .filter((t) => postIds.includes(t.id))
      .map((t) => [t.id, { content: t.content, tweetUrl: t.tweetUrl }])
  );

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Unreplied Replies — ${profileDisplayName} (Twitter)` },
    },
  ];

  for (const [postId, replies] of byPost) {
    const tweet = postMap.get(postId);
    const rawSnippet = tweet?.content
      ? tweet.content.length > 80
        ? tweet.content.slice(0, 80) + "..."
        : tweet.content
      : "(tweet)";
    const snippet = rawSnippet.replace(/\n+/g, " ");
    const postLink = tweet?.tweetUrl ? `<${tweet.tweetUrl}|View tweet>` : "";

    const replyLines = replies
      .slice(0, 5)
      .map((r) => {
        const name = r.authorName || r.authorHandle || "Someone";
        const link = r.authorTwitterUrl ? `<${r.authorTwitterUrl}|${name}>` : name;
        const preview = r.replyText ? ` — "${r.replyText}"` : "";
        const replyLink = r.replyUrl ? ` (<${r.replyUrl}|view>)` : "";
        return `  ${link}${preview}${replyLink}`;
      })
      .join("\n");

    const moreCount = replies.length > 5 ? `\n  _...and ${replies.length - 5} more_` : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${replies.length} unreplied repl${replies.length > 1 ? "ies" : "y"}* on: _${snippet}_ ${postLink}\n${replyLines}${moreCount}`,
      },
    });
  }

  const channelIds = channelId
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  for (const ch of channelIds) {
    await sendAnalyticsSlackMessage(
      ch,
      `${recent.length} unreplied repl${recent.length > 1 ? "ies" : "y"} on ${profileDisplayName}'s tweets`,
      blocks
    );
  }

  // Mark as notified
  for (const r of recent) {
    await db.update(twitterPostReplies).set({ notifiedAt: new Date() }).where(eq(twitterPostReplies.id, r.id));
  }

  return byPost.size;
}
