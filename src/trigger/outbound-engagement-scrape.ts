import { task, logger, metadata, queue } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { eq } from "drizzle-orm";
import {
  scrapeProfilePosts,
  normalizePost,
  extractAuthorName,
  sendPostToSlack,
} from "@/lib/engagement-bot";
import {
  createJob,
  updateJob,
  savePosts,
  saveRawResults,
  markPostSentToSlack,
  updateProfile,
  getProfile,
  claimUnsentPosts,
  unclaimPost,
} from "@/lib/engagement-bot-db";
import { takeSnapshots } from "@/lib/post-analytics";

const outboundEngagementQueue = queue({
  name: "outbound-engagement-scrape",
  concurrencyLimit: 2,
});

interface OutboundScrapePayload {
  accountId: string;
  profileId: string;
  maxPosts?: number;
}

const POST_MAX_AGE_DAYS = 1;

export const outboundEngagementScrapeTask = task({
  id: "outbound-engagement-scrape",
  queue: outboundEngagementQueue,
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async (payload: OutboundScrapePayload) => {
    const { accountId, profileId, maxPosts = 10 } = payload;

    metadata.set("progress", { step: "Creating job", stepNumber: 1, totalSteps: 7, percentage: 0 });

    const profile = await getProfile(profileId);
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const job = await createJob(profileId, accountId);
    await updateJob(job.id, { status: "running" });

    try {
      // Step 2: Scrape via Apify
      metadata.set("progress", { step: "Scraping posts", stepNumber: 2, totalSteps: 7, percentage: 15 });
      const { runId, rawPosts } = await scrapeProfilePosts(profile.linkedinUrl, maxPosts);

      // Step 3: Save raw results
      metadata.set("progress", { step: "Saving raw results", stepNumber: 3, totalSteps: 7, percentage: 30 });
      await saveRawResults(job.id, profileId, rawPosts);

      // Step 4: Auto-populate displayName
      if (!profile.displayName && rawPosts.length > 0) {
        const authorName = extractAuthorName(rawPosts[0]);
        if (authorName) {
          await updateProfile(profileId, { displayName: authorName });
        }
      }

      // Step 5: Normalize + date-filter posts
      metadata.set("progress", { step: "Normalizing posts", stepNumber: 4, totalSteps: 7, percentage: 45 });
      const cutoff = new Date(Date.now() - POST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
      const normalized = rawPosts
        .map(normalizePost)
        .filter((p) => {
          if (!p.postedAt) return true; // No date = treat as recent
          return p.postedAt >= cutoff;
        });

      // Step 6: Upsert posts
      metadata.set("progress", { step: "Saving posts", stepNumber: 5, totalSteps: 7, percentage: 60 });
      const { total, newPosts } = await savePosts(profileId, normalized);

      // Step 6b: Take engagement snapshot for growth tracking
      const snapshotsTaken = await takeSnapshots(profileId, accountId);
      logger.info(`Took ${snapshotsTaken} engagement snapshots for profile ${profileId}`);

      // Update lastScrapedAt
      await updateProfile(profileId, { lastScrapedAt: new Date() });

      // Step 7: Send unsent posts to Slack (new + previously failed sends)
      metadata.set("progress", { step: "Sending to Slack", stepNumber: 6, totalSteps: 7, percentage: 75 });
      const [account] = await db
        .select({ engagementSlackChannel: accounts.engagementSlackChannel })
        .from(accounts)
        .where(eq(accounts.id, accountId));

      const channelId = account?.engagementSlackChannel;
      const updatedProfile = await getProfile(profileId);

      let slackFailures = 0;
      if (channelId && updatedProfile) {
        // Atomically claim unsent posts (pending → sending) to prevent duplicate Slack cards
        const claimed = await claimUnsentPosts(profileId);
        for (const post of claimed) {
          try {
            const ts = await sendPostToSlack(channelId, post, updatedProfile);
            await markPostSentToSlack(post.id, ts);
          } catch (err) {
            slackFailures++;
            logger.error(`Failed to send Slack card for post ${post.id}: ${String(err)}`);
            // Revert to pending so next run can retry
            await unclaimPost(post.id);
          }
        }
      }

      // Complete
      metadata.set("progress", { step: "Done", stepNumber: 7, totalSteps: 7, percentage: 100 });
      const jobStatus = slackFailures > 0 ? "partial" : "completed";
      await updateJob(job.id, {
        status: jobStatus,
        postsFound: total,
        postsNew: newPosts.length,
        apifyRunId: runId,
        completedAt: new Date(),
      });

      logger.info(`Scrape job ${jobStatus}: ${total} found, ${newPosts.length} new, ${slackFailures} Slack failures`);
      return { postsFound: total, postsNew: newPosts.length, slackFailures };
    } catch (err) {
      logger.error(`Scrape job failed`, { error: String(err) });
      await updateJob(job.id, {
        status: "failed",
        errorMessage: String(err),
        completedAt: new Date(),
      });
      await sendSlackNotification({
        tool: "Engagement Bot Scrape",
        userName: "system",
        error: String(err),
        runId: job.id,
      });
      throw err;
    }
  },
});
