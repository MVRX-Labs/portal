/**
 * Analytics scrape — tracks OUR CLIENTS' LinkedIn post performance.
 *
 * Scrapes managed profiles (client accounts) via Apify, ingests posts + snapshots.
 * Separate from outbound-engagement-scrape (which tracks external profiles to engage WITH).
 */

import { task, schedules, logger, metadata, queue } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { managedProfiles, accounts } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { ingestPosts, getManagedProfile } from "@/lib/post-analytics";
import { sendSlackNotification } from "@/lib/slack";

const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_ACTOR_ID = "supreme_coder/linkedin-post";

const analyticsQueue = queue({
  name: "analytics-scrape",
  concurrencyLimit: 2,
});

interface AnalyticsScrapePayload {
  accountId: string;
  profileId: string;
  maxPosts?: number;
}

export const analyticsScrapeTask = task({
  id: "analytics-scrape",
  queue: analyticsQueue,
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: AnalyticsScrapePayload) => {
    const { accountId, profileId, maxPosts = 200 } = payload;

    const profile = await getManagedProfile(profileId);
    if (!profile) throw new Error(`Managed profile ${profileId} not found`);

    logger.info("Starting analytics scrape", {
      accountId,
      profileId,
      linkedinUrl: profile.linkedinUrl,
    });

    metadata.set("progress", { step: "Scraping posts via Apify", percentage: 10 });

    // Scrape via Apify
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error("APIFY_API_TOKEN not set");

    const url = `${APIFY_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/run-sync-get-dataset-items?token=${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [profile.linkedinUrl], maxPosts }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apify actor failed (${res.status}): ${text}`);
    }

    const rawPosts = (await res.json()) as Record<string, unknown>[];
    logger.info(`Apify returned ${rawPosts.length} posts for ${profile.linkedinUrl}`);

    metadata.set("progress", { step: "Ingesting posts + snapshots", percentage: 60 });

    // Ingest into managed_posts + take snapshots
    const { total, newCount } = await ingestPosts(profileId, accountId, rawPosts);

    metadata.set("progress", { step: "Done", percentage: 100 });
    logger.info(`Analytics scrape complete: ${total} posts (${newCount} new) for ${profile.displayName}`);

    return { postsFound: total, newPosts: newCount };
  },
});

// Scheduled: run daily for all active managed profiles
export const analyticsScheduler = schedules.task({
  id: "analytics-scheduler",
  cron: "0 6 * * *", // 6 AM UTC daily
  run: async () => {
    logger.info("Starting analytics scheduler");

    const profiles = await db
      .select({
        id: managedProfiles.id,
        accountId: managedProfiles.accountId,
        linkedinUrl: managedProfiles.linkedinUrl,
        displayName: managedProfiles.displayName,
      })
      .from(managedProfiles)
      .where(eq(managedProfiles.active, true));

    if (profiles.length === 0) {
      logger.info("No active managed profiles to scrape");
      return { profilesScraped: 0 };
    }

    await analyticsScrapeTask.batchTrigger(
      profiles.map((p) => ({
        payload: { accountId: p.accountId, profileId: p.id },
      })),
    );

    logger.info(`Batch triggered ${profiles.length} analytics scrape tasks`);
    return { profilesScraped: profiles.length };
  },
});
