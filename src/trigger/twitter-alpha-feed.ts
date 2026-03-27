/**
 * twitter-alpha-feed: Daily collection of tweets from sages and keyword searches.
 *
 * - twitter-alpha-feed-collect-scheduler: Daily cron (7:30 AM UTC) that triggers collection for all active feeds
 * - twitter-alpha-feed-collect-worker: Scrapes sage tweets and keyword searches, stores top posts
 */

import { schedules, task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import {
  twitterAlphaFeeds,
  type TwitterAlphaFeedSage,
  type TwitterAlphaFeedKeyword,
  type TwitterAlphaFeedEntry,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { scrapeProfileTweets, normalizeTweet, extractAuthorName } from "@/lib/twitter-engagement-bot";
import { runApifyActor } from "@/lib/apify";
import { sendSlackNotification } from "@/lib/slack";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWITTER_SEARCH_ACTOR = "scrape.badger/twitter-tweets-scraper";
const DAYS_TO_KEEP = 7;

const twitterAlphaFeedQueue = queue({
  name: "twitter-alpha-feed-collect",
  concurrencyLimit: 3,
});

// ---------------------------------------------------------------------------
// Task 1: Daily Collection Scheduler
// ---------------------------------------------------------------------------

export const twitterAlphaFeedCollectScheduler = schedules.task({
  id: "twitter-alpha-feed-collect-scheduler",
  cron: "30 7 * * *", // 7:30 AM UTC daily
  run: async () => {
    // Find all twitter alpha feeds that have at least one active sage or keyword
    const feeds = await db.select().from(twitterAlphaFeeds);

    const activeFeeds = feeds.filter((f) => {
      const sages = (f.sages ?? []) as TwitterAlphaFeedSage[];
      const keywords = (f.keywords ?? []) as TwitterAlphaFeedKeyword[];
      return sages.some((s) => s.active) || keywords.some((k) => k.active);
    });

    if (activeFeeds.length === 0) {
      logger.info("No active Twitter alpha feeds to collect");
      return { triggered: 0 };
    }

    await twitterAlphaFeedCollectWorker.batchTrigger(
      activeFeeds.map((f) => ({ payload: { twitterAlphaFeedId: f.id } }))
    );

    logger.info(`Triggered ${activeFeeds.length} Twitter alpha feed collections`);
    return { triggered: activeFeeds.length };
  },
});

// ---------------------------------------------------------------------------
// Task 2: Collection Worker
// ---------------------------------------------------------------------------

export const twitterAlphaFeedCollectWorker = task({
  id: "twitter-alpha-feed-collect-worker",
  queue: twitterAlphaFeedQueue,
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: { twitterAlphaFeedId: string }, { ctx }) => {
    try {
      const [feed] = await db
        .select()
        .from(twitterAlphaFeeds)
        .where(eq(twitterAlphaFeeds.id, payload.twitterAlphaFeedId));

      if (!feed) throw new Error(`Twitter alpha feed not found: ${payload.twitterAlphaFeedId}`);

      const sages = ((feed.sages ?? []) as TwitterAlphaFeedSage[]).filter((s) => s.active);
      const keywords = ((feed.keywords ?? []) as TwitterAlphaFeedKeyword[]).filter((k) => k.active);

      logger.info("Collecting Twitter alpha feed", {
        feedId: feed.id,
        sages: sages.length,
        keywords: keywords.length,
      });

      const allEntries: TwitterAlphaFeedEntry[] = [];

      // Scrape sage tweets
      for (const sage of sages) {
        try {
          const { rawTweets } = await scrapeProfileTweets(sage.twitterUrl, 10);
          for (const raw of rawTweets) {
            const tweet = normalizeTweet(raw);
            if (!tweet || !tweet.tweetUrl) continue;
            // Skip retweets — we want original content
            if (tweet.tweetType === "retweet") continue;

            const authorName = extractAuthorName(raw) || sage.displayName;
            const authorHandle = raw.username || raw.user?.screen_name || sage.twitterHandle;
            const authorBio = raw.user_description || raw.user?.description || sage.bio;

            allEntries.push({
              tweetUrl: tweet.tweetUrl,
              authorName,
              authorTwitterUrl: sage.twitterUrl,
              authorTwitterHandle: authorHandle || undefined,
              authorBio: authorBio || undefined,
              content: tweet.content,
              likesCount: tweet.likesCount,
              retweetsCount: tweet.retweetsCount,
              repliesCount: tweet.repliesCount,
              viewsCount: tweet.viewsCount,
              bookmarksCount: tweet.bookmarksCount,
              postedAt: tweet.postedAt?.toISOString(),
              engagementScore:
                tweet.likesCount + tweet.retweetsCount * 3 + tweet.repliesCount * 2 + tweet.viewsCount * 0.01,
              sourceType: "sage",
              sourceLabel: sage.displayName || sage.twitterHandle || sage.twitterUrl,
            });
          }
          logger.info(`Scraped ${rawTweets.length} tweets from sage`, {
            sage: sage.displayName || sage.twitterUrl,
          });
        } catch (err) {
          logger.warn(`Failed to scrape sage ${sage.twitterUrl}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Scrape keyword searches
      for (const keyword of keywords) {
        try {
          const items = (await runApifyActor(
            TWITTER_SEARCH_ACTOR,
            {
              mode: "Advanced Search",
              query: keyword.query,
              query_type: "Latest",
              max_results: 10,
            },
            { label: `Twitter alpha feed keyword: ${keyword.query}` }
          )) as Record<string, unknown>[];

          if (items.length > 0) {
            logger.info("Keyword search sample result", {
              keyword: keyword.query,
              sampleKeys: Object.keys(items[0] as Record<string, unknown>),
              sample: JSON.stringify(items[0]).slice(0, 1000),
            });
          }

          for (const raw of items) {
            const entry = parseKeywordSearchResult(raw, keyword.query);
            if (entry) allEntries.push(entry);
          }
          logger.info(`Scraped ${items.length} tweets for keyword`, {
            keyword: keyword.query,
            parsed: items.length,
          });
        } catch (err) {
          logger.warn(`Failed to scrape keyword "${keyword.query}"`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Deduplicate by tweetUrl, sort by engagement, store all
      const seen = new Set<string>();
      const deduped = allEntries.filter((e) => {
        if (seen.has(e.tweetUrl)) return false;
        seen.add(e.tweetUrl);
        return true;
      });

      deduped.sort((a, b) => b.engagementScore - a.engagementScore);

      // Update daily_entries: add today, prune old days
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const dailyEntries = (feed.dailyEntries ?? {}) as Record<string, TwitterAlphaFeedEntry[]>;
      dailyEntries[today] = deduped;

      // Prune entries older than DAYS_TO_KEEP
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      for (const dateKey of Object.keys(dailyEntries)) {
        if (dateKey < cutoffStr) {
          delete dailyEntries[dateKey];
        }
      }

      await db
        .update(twitterAlphaFeeds)
        .set({ dailyEntries, updatedAt: new Date() })
        .where(eq(twitterAlphaFeeds.id, feed.id));

      logger.info("Twitter alpha feed collection complete", {
        feedId: feed.id,
        totalScraped: allEntries.length,
        deduped: deduped.length,
        stored: deduped.length,
      });

      return { stored: deduped.length, date: today };
    } catch (err) {
      await sendSlackNotification({
        tool: "twitter-alpha-feed-collect-worker",
        userName: "trigger-task",
        error: err instanceof Error ? err.message : String(err),
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a keyword search result from scrape.badger/twitter-tweets-scraper.
 *
 * Uses the same flat field format as normalizeTweet, but we also extract
 * author metadata (handle, bio) from the raw result.
 */
function parseKeywordSearchResult(raw: Record<string, unknown>, sourceLabel: string): TwitterAlphaFeedEntry | null {
  const tweetId = (raw.id_str as string) || (raw.id as string) || (raw.tweetId as string) || "";
  if (!tweetId) return null;

  // Skip retweets
  if (raw.is_retweet === true || raw.retweeted_status) return null;

  const content = (raw.full_text as string) || (raw.text as string) || (raw.content as string) || "";
  const screenName = (raw.username as string) || "";
  const tweetUrl =
    (raw.url as string) ||
    (raw.tweetUrl as string) ||
    (screenName ? `https://x.com/${screenName}/status/${tweetId}` : "");

  if (!tweetUrl) return null;

  const authorName = (raw.user_name as string) || (raw.name as string) || "";
  const authorHandle = screenName || undefined;
  const authorTwitterUrl = screenName ? `https://x.com/${screenName}` : undefined;
  const authorBio = (raw.user_description as string) || undefined;

  const likesCount = parseCount(raw.favorite_count ?? raw.likes);
  const retweetsCount = parseCount(raw.retweet_count ?? raw.retweets);
  const repliesCount = parseCount(raw.reply_count ?? raw.replies);
  const viewsCount = parseCount(raw.view_count ?? raw.views_count ?? raw.views);
  const bookmarksCount = parseCount(raw.bookmark_count ?? raw.bookmarks);

  const postedAt = parseDate(raw.created_at);

  return {
    tweetUrl,
    authorName,
    authorTwitterUrl,
    authorTwitterHandle: authorHandle,
    authorBio,
    content,
    likesCount,
    retweetsCount,
    repliesCount,
    viewsCount,
    bookmarksCount,
    postedAt,
    engagementScore: likesCount + retweetsCount * 3 + repliesCount * 2 + viewsCount * 0.01,
    sourceType: "keyword",
    sourceLabel,
  };
}

function parseCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function parseDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}
