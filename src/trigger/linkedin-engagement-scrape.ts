import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { leads, toolRuns } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  scrapeRecentPosts,
  scrapePostComments,
  type EngagedPerson,
} from "@/lib/linkedin-engagement";

interface ScrapePayload {
  accountId: string;
  contactId: string | null;
  linkedinUrl: string;
  sourceType: "company" | "personal";
  runId?: string;
}

export const linkedinEngagementScrapeTask = task({
  id: "linkedin-engagement-scrape",
  maxDuration: 3600,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: ScrapePayload, { signal }) => {
    const { accountId, contactId, linkedinUrl, sourceType, runId } = payload;

    try {
      logger.info("Starting engagement scrape", {
        accountId,
        contactId,
        linkedinUrl,
        sourceType,
      });

      // Step 1: Scrape recent posts
      metadata.set("progress", {
        step: "Scraping recent posts",
        stepNumber: 1,
        totalSteps: 4,
        percentage: 0,
      });

      const recentPosts = await scrapeRecentPosts(linkedinUrl, signal);
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

      // Step 2: Collect reactions (already embedded in posts) + scrape comments
      metadata.set("progress", {
        step: "Scraping comments",
        stepNumber: 2,
        totalSteps: 4,
        percentage: 20,
      });

      const allEngagers: EngagedPerson[] = [];

      for (const post of recentPosts) {
        // Reactions are already extracted from the posts actor response
        allEngagers.push(...post.reactions);

        // Comments need a separate actor call
        try {
          const comments = await scrapePostComments(post.postUrl, signal);
          allEngagers.push(...comments);
        } catch (err) {
          logger.warn(`Failed to scrape comments for ${post.postUrl}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
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

      // Step 3: Deduplicate by LinkedIn URL locally
      metadata.set("progress", {
        step: "Normalizing and deduplicating leads",
        stepNumber: 3,
        totalSteps: 4,
        percentage: 60,
      });

      const engagerMap = new Map<string, EngagedPerson & { engagementTypes: string[]; engagementPosts: string[] }>();

      for (const person of allEngagers) {
        const key = person.linkedinUrl.toLowerCase().replace(/\/$/, "");
        const existing = engagerMap.get(key);

        if (existing) {
          if (!existing.engagementTypes.includes(person.engagementType)) {
            existing.engagementTypes.push(person.engagementType);
          }
          if (!existing.engagementPosts.includes(person.postUrl)) {
            existing.engagementPosts.push(person.postUrl);
          }
          // Prefer newer/more complete data
          if (person.headline && !existing.headline) existing.headline = person.headline;
          if (person.company && !existing.company) existing.company = person.company;
          if (person.profileImageUrl && !existing.profileImageUrl)
            existing.profileImageUrl = person.profileImageUrl;
        } else {
          engagerMap.set(key, {
            ...person,
            engagementTypes: [person.engagementType],
            engagementPosts: [person.postUrl],
          });
        }
      }

      const uniqueEngagers = Array.from(engagerMap.values());
      logger.info(`Unique engagers after dedup: ${uniqueEngagers.length}`);

      // Step 4: Upsert into leads table
      metadata.set("progress", {
        step: "Upserting leads into database",
        stepNumber: 4,
        totalSteps: 4,
        percentage: 80,
      });

      const linkedinUrls = uniqueEngagers.map((e) =>
        e.linkedinUrl.toLowerCase().replace(/\/$/, "")
      );

      // Fetch existing leads for this account matching these URLs
      const existingLeads = linkedinUrls.length > 0
        ? await db
            .select()
            .from(leads)
            .where(
              and(eq(leads.accountId, accountId), inArray(leads.linkedinUrl, linkedinUrls))
            )
        : [];

      const existingMap = new Map(
        existingLeads.map((l) => [l.linkedinUrl.toLowerCase().replace(/\/$/, ""), l])
      );

      let upsertCount = 0;
      const now = new Date();

      await db.transaction(async (tx) => {
        for (const engager of uniqueEngagers) {
          const normalizedUrl = engager.linkedinUrl.toLowerCase().replace(/\/$/, "");
          const existing = existingMap.get(normalizedUrl);

          if (existing) {
            // Merge engagement types and posts
            const mergedTypes = [
              ...new Set([
                ...((existing.engagementTypes as string[]) || []),
                ...engager.engagementTypes,
              ]),
            ];
            const mergedPosts = [
              ...new Set([
                ...((existing.engagementPosts as string[]) || []),
                ...engager.engagementPosts,
              ]),
            ];

            await tx
              .update(leads)
              .set({
                engagementTypes: mergedTypes,
                engagementPosts: mergedPosts,
                lastSeenAt: now,
                headline: engager.headline || existing.headline,
                company: engager.company || existing.company,
                profileImageUrl: engager.profileImageUrl || existing.profileImageUrl,
                updatedAt: now,
              })
              .where(eq(leads.id, existing.id));
          } else {
            await tx.insert(leads).values({
              accountId,
              contactId,
              linkedinUrl: normalizedUrl,
              linkedinSlug: engager.linkedinSlug,
              firstName: engager.firstName,
              lastName: engager.lastName,
              headline: engager.headline,
              company: engager.company,
              profileImageUrl: engager.profileImageUrl,
              engagementTypes: engager.engagementTypes,
              engagementPosts: engager.engagementPosts,
              firstSeenAt: now,
              lastSeenAt: now,
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

      throw err;
    }
  },
});
