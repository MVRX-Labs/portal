/**
 * Track Twitter posts — scrapes stats for specific tweet URLs,
 * saves snapshots, and reports performance back in a Slack thread.
 */

import { task, logger } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { twitterPosts, twitterPostSnapshots } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { scrapeProfileTweets, normalizeTweet, extractHandle } from "@/lib/twitter-engagement-bot";
import { sendAnalyticsSlackMessage, sendSlackNotification } from "@/lib/slack";

interface TrackedTweet {
  tweetUrl: string;
  profileId: string | null;
}

interface TrackTweetPayload {
  tweets: TrackedTweet[];
  accountId: string;
  channelId: string;
  threadTs: string;
  label: string;
}

interface TweetResult {
  tweetUrl: string;
  content: string;
  likes: number;
  retweets: number;
  quotes: number;
  replies: number;
  bookmarks: number;
  views: number;
  total: number;
  failed: boolean;
}

export const trackTweetTask = task({
  id: "track-tweet",
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: TrackTweetPayload, { ctx }) => {
    const { tweets, accountId, channelId, threadTs, label } = payload;

    try {
      logger.info("Scraping tracked tweets", { count: tweets.length, accountId });

      const results: TweetResult[] = [];

      for (const tracked of tweets) {
        try {
          // Extract handle from URL to use Advanced Search
          const handle = extractHandle(tracked.tweetUrl);
          if (!handle) {
            results.push({
              tweetUrl: tracked.tweetUrl,
              content: "",
              likes: 0,
              retweets: 0,
              quotes: 0,
              replies: 0,
              bookmarks: 0,
              views: 0,
              total: 0,
              failed: true,
            });
            continue;
          }

          const { rawTweets } = await scrapeProfileTweets(`https://x.com/${handle}`, 5);

          // Find the specific tweet by ID
          const tweetIdMatch = tracked.tweetUrl.match(/\/status\/(\d+)/);
          const targetId = tweetIdMatch?.[1];
          const matchedRaw = targetId
            ? rawTweets.find((t: any) => String(t.id || t.id_str) === targetId)
            : rawTweets[0];

          if (!matchedRaw) {
            results.push({
              tweetUrl: tracked.tweetUrl,
              content: "",
              likes: 0,
              retweets: 0,
              quotes: 0,
              replies: 0,
              bookmarks: 0,
              views: 0,
              total: 0,
              failed: true,
            });
            continue;
          }

          const normalized = normalizeTweet(matchedRaw);
          if (!normalized) {
            results.push({
              tweetUrl: tracked.tweetUrl,
              content: "",
              likes: 0,
              retweets: 0,
              quotes: 0,
              replies: 0,
              bookmarks: 0,
              views: 0,
              total: 0,
              failed: true,
            });
            continue;
          }

          // Upsert + snapshot if we have a profile
          if (tracked.profileId && normalized.externalTweetId) {
            const [existing] = await db
              .select()
              .from(twitterPosts)
              .where(
                and(
                  eq(twitterPosts.profileId, tracked.profileId),
                  eq(twitterPosts.externalTweetId, normalized.externalTweetId)
                )
              );

            let postId: string;
            if (existing) {
              await db
                .update(twitterPosts)
                .set({
                  likesCount: normalized.likesCount,
                  retweetsCount: normalized.retweetsCount,
                  quotesCount: normalized.quotesCount,
                  repliesCount: normalized.repliesCount,
                  bookmarksCount: normalized.bookmarksCount,
                  viewsCount: normalized.viewsCount,
                  tweetUrl: normalized.tweetUrl || existing.tweetUrl,
                })
                .where(eq(twitterPosts.id, existing.id));
              postId = existing.id;
            } else {
              const [inserted] = await db
                .insert(twitterPosts)
                .values({
                  profileId: tracked.profileId,
                  accountId,
                  externalTweetId: normalized.externalTweetId,
                  content: normalized.content.slice(0, 500),
                  tweetUrl: normalized.tweetUrl || tracked.tweetUrl,
                  tweetType: normalized.tweetType,
                  likesCount: normalized.likesCount,
                  retweetsCount: normalized.retweetsCount,
                  quotesCount: normalized.quotesCount,
                  repliesCount: normalized.repliesCount,
                  bookmarksCount: normalized.bookmarksCount,
                  viewsCount: normalized.viewsCount,
                  postedAt: normalized.postedAt,
                })
                .returning({ id: twitterPosts.id });
              postId = inserted.id;
            }

            await db.insert(twitterPostSnapshots).values({
              postId,
              profileId: tracked.profileId,
              accountId,
              likesCount: normalized.likesCount,
              retweetsCount: normalized.retweetsCount,
              quotesCount: normalized.quotesCount,
              repliesCount: normalized.repliesCount,
              bookmarksCount: normalized.bookmarksCount,
              viewsCount: normalized.viewsCount,
            });
          }

          const total =
            normalized.likesCount +
            normalized.retweetsCount +
            normalized.quotesCount +
            normalized.repliesCount +
            normalized.bookmarksCount;
          results.push({
            tweetUrl: tracked.tweetUrl,
            content: normalized.content,
            likes: normalized.likesCount,
            retweets: normalized.retweetsCount,
            quotes: normalized.quotesCount,
            replies: normalized.repliesCount,
            bookmarks: normalized.bookmarksCount,
            views: normalized.viewsCount,
            total,
            failed: false,
          });
        } catch (err) {
          logger.warn("Failed to scrape tweet", {
            tweetUrl: tracked.tweetUrl,
            error: err instanceof Error ? err.message : String(err),
          });
          results.push({
            tweetUrl: tracked.tweetUrl,
            content: "",
            likes: 0,
            retweets: 0,
            quotes: 0,
            replies: 0,
            bookmarks: 0,
            views: 0,
            total: 0,
            failed: true,
          });
        }
      }

      // Build Slack message
      const blocks: Record<string, unknown>[] = [];
      const successful = results.filter((r) => !r.failed);
      const failed = results.filter((r) => r.failed);

      if (successful.length === 1) {
        const r = successful[0];
        const snippet = r.content.length > 100 ? r.content.slice(0, 100) + "..." : r.content || "(no text)";
        blocks.push(
          { type: "header", text: { type: "plain_text", text: `${label} Tweet Performance` } },
          { type: "section", text: { type: "mrkdwn", text: `> ${snippet}` } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Likes*\n${r.likes.toLocaleString()}` },
              { type: "mrkdwn", text: `*Retweets*\n${r.retweets.toLocaleString()}` },
              { type: "mrkdwn", text: `*Replies*\n${r.replies.toLocaleString()}` },
              { type: "mrkdwn", text: `*Views*\n${r.views.toLocaleString()}` },
            ],
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: `Quotes: ${r.quotes} | Bookmarks: ${r.bookmarks} | <${r.tweetUrl}|View Tweet>` },
            ],
          }
        );
      } else if (successful.length > 1) {
        blocks.push({
          type: "header",
          text: { type: "plain_text", text: `${label} Tweet Performance` },
        });

        const rows = successful.map((r, i) => {
          const snippet = r.content.length > 60 ? r.content.slice(0, 60) + "..." : r.content || "(no text)";
          return (
            `<${r.tweetUrl}|Tweet ${i + 1}>  —  ${snippet}\n` +
            `:heart: ${r.likes}  :repeat: ${r.retweets}  :speech_balloon: ${r.replies}  :eyes: ${r.views.toLocaleString()} views  ·  *${r.total} engagement*`
          );
        });

        blocks.push({ type: "section", text: { type: "mrkdwn", text: rows.join("\n\n") } });

        const totLikes = successful.reduce((s, r) => s + r.likes, 0);
        const totRTs = successful.reduce((s, r) => s + r.retweets, 0);
        const totReplies = successful.reduce((s, r) => s + r.replies, 0);
        const totViews = successful.reduce((s, r) => s + r.views, 0);
        const totAll = successful.reduce((s, r) => s + r.total, 0);
        blocks.push({ type: "divider" });
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Combined:* ${totLikes} likes · ${totRTs} retweets · ${totReplies} replies · ${totViews.toLocaleString()} views · *${totAll} total engagement*`,
            },
          ],
        });
      }

      if (failed.length > 0) {
        const failedLinks = failed.map((r) => `<${r.tweetUrl}|link>`).join(", ");
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `Could not fetch: ${failedLinks}` }],
        });
      }

      if (blocks.length > 0) {
        const fallback = successful.map((r) => `${r.likes} likes, ${r.retweets} RTs, ${r.views} views`).join(" | ");

        await sendAnalyticsSlackMessage(channelId, `${label} Performance: ${fallback}`, blocks, {
          thread_ts: threadTs,
        });
      }

      logger.info("Tweet tracking complete", { label, tracked: results.length });
      return { success: true, results };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Tweet tracking failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "track-tweet",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});
