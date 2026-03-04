import { task, logger, metadata, queue } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { leads, toolRuns } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";
import {
  scrapeRecentPosts,
  scrapePostReactions,
  scrapePostComments,
  scrapePostReshares,
  type EngagedPerson,
} from "@/lib/linkedin-engagement";

const engagementQueue = queue({
  name: "linkedin-engagement-scrape",
  concurrencyLimit: 2,
});

interface ScrapePayload {
  accountId: string;
  contactId: string | null;
  linkedinUrl: string;
  sourceType: "company" | "personal";
  runId?: string;
  hoursBack?: number;
}

export const linkedinEngagementScrapeTask = task({
  id: "linkedin-engagement-scrape",
  queue: engagementQueue,
  maxDuration: 3600,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: ScrapePayload, { signal }) => {
    const { accountId, contactId, linkedinUrl, sourceType, runId, hoursBack } = payload;

    try {
      logger.info("Starting engagement scrape", {
        accountId,
        contactId,
        linkedinUrl,
        sourceType,
      });

      // Step 1: Discover recent posts
      metadata.set("progress", {
        step: "Scraping recent posts",
        stepNumber: 1,
        totalSteps: 4,
        percentage: 0,
      });

      const recentPosts = await scrapeRecentPosts(linkedinUrl, signal, hoursBack);
      logger.info(`Found ${recentPosts.length} recent posts`);

      if (recentPosts.length === 0) {
        metadata.set("progress", {
          step: "No recent posts found",
          stepNumber: 4,
          totalSteps: 4,
          percentage: 100,
        });

        const result = { postsScraped: 0, leadsFound: 0, leadsUpserted: 0 };

        if (runId) {
          await db
            .update(toolRuns)
            .set({
              status: "completed",
              output: `No recent posts found for ${linkedinUrl}`,
              updatedAt: new Date(),
            })
            .where(eq(toolRuns.id, runId));
        }

        return result;
      }

      // Step 2: Scrape reactions, comments, and reshares for each post
      metadata.set("progress", {
        step: "Scraping reactions, comments, and reshares",
        stepNumber: 2,
        totalSteps: 4,
        percentage: 20,
      });

      const allEngagers: EngagedPerson[] = [];

      for (let i = 0; i < recentPosts.length; i++) {
        const post = recentPosts[i];
        const postDate = new Date(post.postedDate);
        logger.info(
          `Processing post ${i + 1}/${recentPosts.length}: ${post.numLikes} likes, ${post.numComments} comments, ${post.numShares} shares`,
        );

        // Reactions
        try {
          const reactions = await scrapePostReactions(post.postUrl, signal, runId, postDate);
          allEngagers.push(...reactions);
          logger.info(`Got ${reactions.length} reactions for post ${i + 1}`);
        } catch (err) {
          logger.warn(`Failed to scrape reactions for ${post.postUrl}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Comments
        try {
          const comments = await scrapePostComments(post.postUrl, signal, runId, postDate);
          allEngagers.push(...comments);
          logger.info(`Got ${comments.length} comments for post ${i + 1}`);
        } catch (err) {
          logger.warn(`Failed to scrape comments for ${post.postUrl}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Reshares
        if (post.numShares > 0) {
          try {
            const reshares = await scrapePostReshares(post.postUrl, signal, runId, postDate);
            allEngagers.push(...reshares);
            logger.info(`Got ${reshares.length} reshares for post ${i + 1}`);
          } catch (err) {
            logger.warn(`Failed to scrape reshares for ${post.postUrl}`, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        metadata.set("progress", {
          step: `Scraped post ${i + 1}/${recentPosts.length}`,
          stepNumber: 2,
          totalSteps: 4,
          percentage: 20 + Math.round((40 * (i + 1)) / recentPosts.length),
        });
      }

      logger.info(`Total engagers found: ${allEngagers.length}`);

      if (allEngagers.length === 0) {
        metadata.set("progress", {
          step: "No engagers found",
          stepNumber: 4,
          totalSteps: 4,
          percentage: 100,
        });

        const result = {
          postsScraped: recentPosts.length,
          leadsFound: 0,
          leadsUpserted: 0,
        };

        if (runId) {
          await db
            .update(toolRuns)
            .set({
              status: "completed",
              output: `Scraped ${recentPosts.length} posts but found no engagers`,
              updatedAt: new Date(),
            })
            .where(eq(toolRuns.id, runId));
        }

        return result;
      }

      // Step 3: Deduplicate by LinkedIn URL
      metadata.set("progress", {
        step: "Normalizing and deduplicating leads",
        stepNumber: 3,
        totalSteps: 4,
        percentage: 60,
      });

      type DedupedEngager = EngagedPerson & {
        engagementTypes: string[];
        engagementPosts: string[];
        firstEngagedAt: Date;
        lastEngagedAt: Date;
      };

      function mergeInto(target: DedupedEngager, source: EngagedPerson) {
        if (!target.engagementTypes.includes(source.engagementType)) {
          target.engagementTypes.push(source.engagementType);
        }
        if (!target.engagementPosts.includes(source.postUrl)) {
          target.engagementPosts.push(source.postUrl);
        }
        if (source.headline && !target.headline) target.headline = source.headline;
        if (source.company && !target.company) target.company = source.company;
        if (source.profileImageUrl && !target.profileImageUrl) target.profileImageUrl = source.profileImageUrl;
        if (source.linkedinUrnUrl && !target.linkedinUrnUrl) target.linkedinUrnUrl = source.linkedinUrnUrl;
        // Prefer slug URL over URN URL as the primary linkedinUrl
        if (source.linkedinSlug && !target.linkedinSlug) {
          target.linkedinUrl = source.linkedinUrl;
          target.linkedinSlug = source.linkedinSlug;
        }
        if (source.engagedAt < target.firstEngagedAt) target.firstEngagedAt = source.engagedAt;
        if (source.engagedAt > target.lastEngagedAt) target.lastEngagedAt = source.engagedAt;
      }

      // Pass 1: Dedup by URL
      const engagerMap = new Map<string, DedupedEngager>();
      for (const person of allEngagers) {
        const key = person.linkedinUrl.replace(/\/$/, "");
        const existing = engagerMap.get(key);
        if (existing) {
          mergeInto(existing, person);
        } else {
          engagerMap.set(key, {
            ...person,
            engagementTypes: [person.engagementType],
            engagementPosts: [person.postUrl],
            firstEngagedAt: person.engagedAt,
            lastEngagedAt: person.engagedAt,
          });
        }
      }

      // Pass 2: Merge URN-URL entries with slug-URL entries by name.
      // The same person can appear with a slug URL (from comments) and a URN URL
      // (from reactions). Match them by lowercase firstName+lastName.
      const nameMap = new Map<string, DedupedEngager>();
      const urlsToRemove: string[] = [];
      for (const [url, engager] of engagerMap) {
        const nameKey = `${engager.firstName.toLowerCase()}|${(engager.lastName || "").toLowerCase()}`;
        const byName = nameMap.get(nameKey);
        if (byName && byName !== engager) {
          // Same name, different URL — merge the URN one into the slug one
          const hasSlug = !engager.linkedinUrnUrl || engager.linkedinSlug;
          const otherHasSlug = !byName.linkedinUrnUrl || byName.linkedinSlug;

          if (hasSlug && !otherHasSlug) {
            // Current has slug, other has URN — merge other into current
            mergeInto(engager, byName);
            if (!engager.linkedinUrnUrl) engager.linkedinUrnUrl = byName.linkedinUrl;
            const otherUrl = byName.linkedinUrl.replace(/\/$/, "");
            urlsToRemove.push(otherUrl);
            nameMap.set(nameKey, engager);
          } else if (!hasSlug && otherHasSlug) {
            // Other has slug, current has URN — merge current into other
            mergeInto(byName, engager);
            if (!byName.linkedinUrnUrl) byName.linkedinUrnUrl = engager.linkedinUrl;
            urlsToRemove.push(url);
          } else {
            // Both have slug or both have URN — don't merge (could be different people)
          }
        } else {
          nameMap.set(nameKey, engager);
        }
      }
      for (const url of urlsToRemove) {
        engagerMap.delete(url);
      }

      const uniqueEngagers = Array.from(engagerMap.values());
      logger.info(`Unique engagers after dedup: ${uniqueEngagers.length} (merged ${urlsToRemove.length} cross-URL duplicates)`);

      // Step 4: Upsert into leads table
      metadata.set("progress", {
        step: "Upserting leads into database",
        stepNumber: 4,
        totalSteps: 4,
        percentage: 80,
      });

      const linkedinUrls = uniqueEngagers.map((e) => e.linkedinUrl.replace(/\/$/, ""));

      // Fetch existing leads for this account matching these URLs
      const existingLeads =
        linkedinUrls.length > 0
          ? await db
              .select()
              .from(leads)
              .where(and(eq(leads.accountId, accountId), inArray(leads.linkedinUrl, linkedinUrls)))
          : [];

      const existingMap = new Map(existingLeads.map((l) => [l.linkedinUrl.replace(/\/$/, ""), l]));

      let upsertCount = 0;
      const now = new Date();

      await db.transaction(async (tx) => {
        for (const engager of uniqueEngagers) {
          const normalizedUrl = engager.linkedinUrl.replace(/\/$/, "");
          const existing = existingMap.get(normalizedUrl);

          if (existing) {
            const mergedTypes = [
              ...new Set([...((existing.engagementTypes as string[]) || []), ...engager.engagementTypes]),
            ];
            const mergedPosts = [
              ...new Set([...((existing.engagementPosts as string[]) || []), ...engager.engagementPosts]),
            ];

            // Use the earlier of existing or new engagement date
            const firstSeenAt = existing.firstSeenAt < engager.firstEngagedAt
              ? existing.firstSeenAt
              : engager.firstEngagedAt;
            const lastSeenAt = existing.lastSeenAt > engager.lastEngagedAt
              ? existing.lastSeenAt
              : engager.lastEngagedAt;

            await tx
              .update(leads)
              .set({
                engagementTypes: mergedTypes,
                engagementPosts: mergedPosts,
                firstSeenAt,
                lastSeenAt,
                headline: engager.headline || existing.headline,
                company: engager.company || existing.company,
                profileImageUrl: engager.profileImageUrl || existing.profileImageUrl,
                linkedinUrnUrl: engager.linkedinUrnUrl || existing.linkedinUrnUrl,
                updatedAt: now,
              })
              .where(eq(leads.id, existing.id));
          } else {
            await tx.insert(leads).values({
              accountId,
              contactId,
              linkedinUrl: normalizedUrl,
              linkedinUrnUrl: engager.linkedinUrnUrl,
              linkedinSlug: engager.linkedinSlug,
              firstName: engager.firstName,
              lastName: engager.lastName,
              headline: engager.headline,
              company: engager.company,
              profileImageUrl: engager.profileImageUrl,
              engagementTypes: engager.engagementTypes,
              engagementPosts: engager.engagementPosts,
              firstSeenAt: engager.firstEngagedAt,
              lastSeenAt: engager.lastEngagedAt,
            });
          }
          upsertCount++;
        }
      });

      metadata.set("progress", {
        step: "Complete",
        stepNumber: 4,
        totalSteps: 4,
        percentage: 100,
      });

      logger.info(`Upserted ${upsertCount} leads for account ${accountId}`);

      const result = {
        postsScraped: recentPosts.length,
        leadsFound: allEngagers.length,
        leadsUpserted: upsertCount,
      };

      if (runId) {
        await db
          .update(toolRuns)
          .set({
            status: "completed",
            output: `Scraped ${result.postsScraped} posts, found ${result.leadsFound} engagers, upserted ${result.leadsUpserted} leads`,
            updatedAt: new Date(),
          })
          .where(eq(toolRuns.id, runId));
      }

      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Engagement scrape failed: ${errorMessage}`, { runId });

      if (runId) {
        await db
          .update(toolRuns)
          .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
          .where(eq(toolRuns.id, runId))
          .catch(() => {});
      }

      sendSlackNotification({
        tool: "linkedin-engagement-scrape",
        userName: "trigger-task",
        error: errorMessage,
        runId: runId ?? "unknown",
      }).catch(() => {});

      throw err;
    }
  },
});
