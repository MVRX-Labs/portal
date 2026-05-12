/**
 * alpha-feed: Alpha Feed spec generation and daily collection.
 *
 * - alpha-feed-generate-spec: On-demand AI task that discovers sages and keywords for an ICP
 * - alpha-feed-collect-scheduler: Daily cron that triggers collection for all active feeds
 * - alpha-feed-collect-worker: Scrapes sages and keyword searches, stores top posts
 */

import { schedules, task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import {
  alphaFeeds,
  twitterAlphaFeeds,
  icpDefinitions,
  accounts,
  type AlphaFeedSage,
  type AlphaFeedKeyword,
  type AlphaFeedEntry,
  type TwitterAlphaFeedSage,
  type TwitterAlphaFeedKeyword,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { runClaudeAgent } from "@/lib/claude-agent";
import { buildLinkedInSpecPrompt, buildTwitterSpecPrompt } from "./alpha-feed-prompts";
import { extractJSON } from "@/lib/audit-utils";
import { scrapeProfilePosts, normalizePost, extractAuthorName } from "@/lib/linkedin-engagement-bot";
import { runApifyActor } from "@/lib/apify";
import { sendSlackNotification } from "@/lib/slack";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINKEDIN_POST_SEARCH_ACTOR = "apimaestro~linkedin-posts-search-scraper-no-cookies";
/** No cap — store all scraped posts, sorted by engagement. Typical day: 40-60 posts (~50-60KB). */
const DAYS_TO_KEEP = 7;

const alphaFeedQueue = queue({
  name: "alpha-feed-collect",
  concurrencyLimit: 3,
});

// ---------------------------------------------------------------------------
// Task 1: Spec Generation (on-demand)
// ---------------------------------------------------------------------------

export const alphaFeedGenerateSpecTask = task({
  id: "alpha-feed-generate-spec",
  maxDuration: 900,
  retry: { maxAttempts: 2 },
  run: async (payload: { accountId: string; icpDefinitionId: string }, { ctx }) => {
    const { accountId, icpDefinitionId } = payload;

    try {
      // Load ICP and account
      const [icp] = await db.select().from(icpDefinitions).where(eq(icpDefinitions.id, icpDefinitionId));
      if (!icp) throw new Error(`ICP definition not found: ${icpDefinitionId}`);

      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!account) throw new Error(`Account not found: ${accountId}`);

      logger.info("Generating alpha feed specs (LinkedIn + Twitter in parallel)", {
        account: account.name,
        icp: icp.name,
      });

      const accountInfo = { name: account.name, industry: account.industry, website: account.website };
      const icpInfo = {
        name: icp.name,
        description: icp.description,
        targetTitles: (icp.targetTitles ?? []) as string[],
        targetIndustries: (icp.targetIndustries ?? []) as string[],
        targetCompanySizes: (icp.targetCompanySizes ?? []) as string[],
        targetSignals: (icp.targetSignals ?? []) as string[],
      };

      // Run LinkedIn and Twitter agent sessions in parallel
      const [linkedinSessionDir, twitterSessionDir] = await Promise.all([
        mkdtemp(join(tmpdir(), "alpha-feed-linkedin-")),
        mkdtemp(join(tmpdir(), "alpha-feed-twitter-")),
      ]);

      const agentOpts = { allowedTools: ["WebSearch" as const], maxTurns: 25, model: "claude-sonnet-4-6" as const };

      const [linkedinResult, twitterResult] = await Promise.all([
        runClaudeAgent(buildLinkedInSpecPrompt(accountInfo, icpInfo), linkedinSessionDir, agentOpts),
        runClaudeAgent(buildTwitterSpecPrompt(accountInfo, icpInfo), twitterSessionDir, agentOpts),
      ]);

      const totalCost = linkedinResult.costUsd + twitterResult.costUsd;
      logger.info("Both agent sessions completed", {
        linkedinCost: linkedinResult.costUsd.toFixed(4),
        twitterCost: twitterResult.costUsd.toFixed(4),
        totalCost: totalCost.toFixed(4),
      });

      // --- Parse and upsert LinkedIn ---
      const linkedinData = JSON.parse(extractJSON(linkedinResult.output));

      const sages: AlphaFeedSage[] = (linkedinData.sages ?? []).map(
        (s: { linkedinUrl: string; displayName?: string; headline?: string; rationale?: string }) => ({
          linkedinUrl: s.linkedinUrl,
          displayName: s.displayName || "",
          headline: s.headline,
          rationale: s.rationale,
          active: true,
        })
      );

      const keywords: AlphaFeedKeyword[] = (linkedinData.keywords ?? []).map(
        (k: { query: string; rationale?: string }) => ({
          query: k.query,
          rationale: k.rationale,
          active: true,
        })
      );

      const [existing] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpDefinitionId));

      if (existing) {
        const existingSages = (existing.sages ?? []) as AlphaFeedSage[];
        const existingKeywords = (existing.keywords ?? []) as AlphaFeedKeyword[];

        const mergedSages = [...existingSages];
        for (const sage of sages) {
          if (!mergedSages.some((s) => s.linkedinUrl === sage.linkedinUrl)) mergedSages.push(sage);
        }

        const mergedKeywords = [...existingKeywords];
        for (const kw of keywords) {
          if (!mergedKeywords.some((k) => k.query === kw.query)) mergedKeywords.push(kw);
        }

        await db
          .update(alphaFeeds)
          .set({ sages: mergedSages, keywords: mergedKeywords, updatedAt: new Date() })
          .where(eq(alphaFeeds.id, existing.id));

        logger.info("Updated LinkedIn alpha feed", { sages: mergedSages.length, keywords: mergedKeywords.length });
      } else {
        await db.insert(alphaFeeds).values({ accountId, icpDefinitionId, sages, keywords });
        logger.info("Created LinkedIn alpha feed", { sages: sages.length, keywords: keywords.length });
      }

      // --- Parse and upsert Twitter ---
      const twitterData = JSON.parse(extractJSON(twitterResult.output));

      const tSages: TwitterAlphaFeedSage[] = (twitterData.sages ?? []).map(
        (s: { twitterHandle: string; displayName?: string; bio?: string; rationale?: string }) => ({
          twitterUrl: `https://x.com/${s.twitterHandle.replace(/^@/, "")}`,
          twitterHandle: s.twitterHandle.replace(/^@/, ""),
          displayName: s.displayName || s.twitterHandle,
          bio: s.bio,
          rationale: s.rationale,
          active: true,
        })
      );

      const tKeywords: TwitterAlphaFeedKeyword[] = (twitterData.keywords ?? []).map(
        (k: { query: string; rationale?: string }) => ({
          query: k.query,
          rationale: k.rationale,
          active: true,
        })
      );

      const [existingTwitter] = await db
        .select()
        .from(twitterAlphaFeeds)
        .where(eq(twitterAlphaFeeds.icpDefinitionId, icpDefinitionId));

      if (existingTwitter) {
        const existingTSages = (existingTwitter.sages ?? []) as TwitterAlphaFeedSage[];
        const existingTKeywords = (existingTwitter.keywords ?? []) as TwitterAlphaFeedKeyword[];

        const mergedTSages = [...existingTSages];
        for (const sage of tSages) {
          if (!mergedTSages.some((s) => s.twitterUrl === sage.twitterUrl)) mergedTSages.push(sage);
        }

        const mergedTKeywords = [...existingTKeywords];
        for (const kw of tKeywords) {
          if (!mergedTKeywords.some((k) => k.query === kw.query)) mergedTKeywords.push(kw);
        }

        await db
          .update(twitterAlphaFeeds)
          .set({ sages: mergedTSages, keywords: mergedTKeywords, updatedAt: new Date() })
          .where(eq(twitterAlphaFeeds.id, existingTwitter.id));

        logger.info("Updated Twitter alpha feed", { sages: mergedTSages.length, keywords: mergedTKeywords.length });
      } else {
        await db.insert(twitterAlphaFeeds).values({ accountId, icpDefinitionId, sages: tSages, keywords: tKeywords });
        logger.info("Created Twitter alpha feed", { sages: tSages.length, keywords: tKeywords.length });
      }

      return {
        sagesCount: sages.length,
        keywordsCount: keywords.length,
        twitterSagesCount: tSages.length,
        twitterKeywordsCount: tKeywords.length,
        costUsd: totalCost,
      };
    } catch (err) {
      await sendSlackNotification({
        tool: "alpha-feed-generate-spec",
        userName: "trigger-task",
        error: err instanceof Error ? err.message : String(err),
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// Task 2: Daily Collection Scheduler
// ---------------------------------------------------------------------------

export const alphaFeedCollectScheduler = schedules.task({
  id: "alpha-feed-collect-scheduler",
  // CRON DISABLED 2026-05-12 — to re-enable, uncomment the `cron` line below and redeploy.
  // cron: "0 7 * * *", // 7 AM UTC daily
  run: async () => {
    // Find all alpha feeds that have at least one active sage or keyword
    const feeds = await db.select().from(alphaFeeds);

    const activeFeeds = feeds.filter((f) => {
      const sages = (f.sages ?? []) as AlphaFeedSage[];
      const keywords = (f.keywords ?? []) as AlphaFeedKeyword[];
      return sages.some((s) => s.active) || keywords.some((k) => k.active);
    });

    if (activeFeeds.length === 0) {
      logger.info("No active alpha feeds to collect");
      return { triggered: 0 };
    }

    await alphaFeedCollectWorker.batchTrigger(activeFeeds.map((f) => ({ payload: { alphaFeedId: f.id } })));

    logger.info(`Triggered ${activeFeeds.length} alpha feed collections`);
    return { triggered: activeFeeds.length };
  },
});

// ---------------------------------------------------------------------------
// Task 3: Collection Worker
// ---------------------------------------------------------------------------

export const alphaFeedCollectWorker = task({
  id: "alpha-feed-collect-worker",
  queue: alphaFeedQueue,
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: { alphaFeedId: string }, { ctx }) => {
    try {
      const [feed] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.id, payload.alphaFeedId));

      if (!feed) throw new Error(`Alpha feed not found: ${payload.alphaFeedId}`);

      const sages = ((feed.sages ?? []) as AlphaFeedSage[]).filter((s) => s.active);
      const keywords = ((feed.keywords ?? []) as AlphaFeedKeyword[]).filter((k) => k.active);

      logger.info("Collecting alpha feed", {
        feedId: feed.id,
        sages: sages.length,
        keywords: keywords.length,
      });

      const allEntries: AlphaFeedEntry[] = [];

      // Scrape sage posts
      for (const sage of sages) {
        try {
          const { rawPosts } = await scrapeProfilePosts(sage.linkedinUrl, 5);
          for (const raw of rawPosts) {
            const post = normalizePost(raw);
            if (!post.postUrl) continue;
            const repostsCount = parseCount(raw.numShares ?? raw.repostsCount ?? raw.reshareCount);
            allEntries.push({
              postUrl: post.postUrl,
              authorName: extractAuthorName(raw) || sage.displayName,
              authorLinkedinUrl: sage.linkedinUrl,
              authorHeadline: sage.headline,
              content: post.content,
              likesCount: post.likesCount,
              commentsCount: post.commentsCount,
              repostsCount,
              postedAt: post.postedAt?.toISOString(),
              engagementScore: post.likesCount + post.commentsCount * 3 + repostsCount * 5,
              sourceType: "sage",
              sourceLabel: sage.displayName || sage.linkedinUrl,
            });
          }
          logger.info(`Scraped ${rawPosts.length} posts from sage`, {
            sage: sage.displayName || sage.linkedinUrl,
          });
        } catch (err) {
          logger.warn(`Failed to scrape sage ${sage.linkedinUrl}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Scrape keyword searches
      for (const keyword of keywords) {
        try {
          const items = (await runApifyActor(
            LINKEDIN_POST_SEARCH_ACTOR,
            {
              keyword: keyword.query,
              total_posts: 5,
              date_filter: "past-24h",
              sort_type: "date_posted",
            },
            { label: `Alpha feed keyword: ${keyword.query}` }
          )) as Record<string, unknown>[];

          // Log first raw result to debug field mapping
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
          logger.info(`Scraped ${items.length} posts for keyword`, {
            keyword: keyword.query,
            parsed: items.length,
          });
        } catch (err) {
          logger.warn(`Failed to scrape keyword "${keyword.query}"`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Deduplicate by postUrl, sort by engagement, take top N
      const seen = new Set<string>();
      const deduped = allEntries.filter((e) => {
        if (seen.has(e.postUrl)) return false;
        seen.add(e.postUrl);
        return true;
      });

      deduped.sort((a, b) => b.engagementScore - a.engagementScore);

      // Update daily_entries: add today, prune old days
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const dailyEntries = (feed.dailyEntries ?? {}) as Record<string, AlphaFeedEntry[]>;
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

      await db.update(alphaFeeds).set({ dailyEntries, updatedAt: new Date() }).where(eq(alphaFeeds.id, feed.id));

      logger.info("Alpha feed collection complete", {
        feedId: feed.id,
        totalScraped: allEntries.length,
        deduped: deduped.length,
        stored: deduped.length,
      });

      return { stored: deduped.length, date: today };
    } catch (err) {
      await sendSlackNotification({
        tool: "alpha-feed-collect-worker",
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
 * Parse a keyword search result from the apimaestro post search actor.
 *
 * Actual output shape (from apify/apimaestro~linkedin-posts-search-scraper-no-cookies-sample.json):
 *   post_url: string
 *   text: string (top-level post text)
 *   author: { name, headline, profile_url, profile_id, image_url }
 *   stats: { total_reactions, comments, shares, reactions: [{type, count}] }
 *   posted_at: { display_text, date, timestamp }
 *   is_reshare: boolean
 */
function parseKeywordSearchResult(raw: Record<string, unknown>, sourceLabel: string): AlphaFeedEntry | null {
  const postUrl = (raw.post_url as string) || (raw.postUrl as string) || "";
  if (!postUrl) return null;

  // Skip reshares
  if (raw.is_reshare === true) return null;

  // Author (nested object)
  const author = typeof raw.author === "object" && raw.author !== null ? (raw.author as Record<string, unknown>) : {};
  const authorName = (author.name as string) || "";
  const authorLinkedinUrl = (author.profile_url as string) || undefined;
  const authorHeadline = (author.headline as string) || undefined;

  // Content — top-level `text` field
  const content = (raw.text as string) || "";

  // Stats (nested object)
  const stats = typeof raw.stats === "object" && raw.stats !== null ? (raw.stats as Record<string, unknown>) : {};
  const likesCount = parseCount(stats.total_reactions);
  const commentsCount = parseCount(stats.comments);
  const repostsCount = parseCount(stats.shares);

  // Posted date (nested object with timestamp in epoch ms)
  const postedAtObj =
    typeof raw.posted_at === "object" && raw.posted_at !== null ? (raw.posted_at as Record<string, unknown>) : {};
  const postedAt = parseDate(postedAtObj.timestamp ?? postedAtObj.date);

  return {
    postUrl,
    authorName,
    authorLinkedinUrl,
    authorHeadline,
    content,
    likesCount,
    commentsCount,
    repostsCount,
    postedAt,
    engagementScore: likesCount + commentsCount * 3 + repostsCount * 5,
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
