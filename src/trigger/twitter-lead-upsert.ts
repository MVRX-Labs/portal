/**
 * twitter-lead-upsert: Reads from twitter_post_engagements and
 * twitter_post_replies for inbound-enabled profiles and upserts leads.
 *
 * No Apify calls — all data is already in the DB from twitter-sync.
 * Triggered after sync completes for profiles with inboundEnabled=true.
 *
 * NOTE: Only retweeters are available as engagers (Twitter made likes
 * private in 2024). Repliers are also treated as leads.
 */

import { task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import {
  twitterPostEngagements,
  twitterPostReplies,
  twitterPosts,
  leads,
  leadCsvs,
  accounts,
  icpDefinitions,
} from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sendSlackNotification, sendSlackFile } from "@/lib/slack";
import { escapeCsv } from "@/lib/csv";
import { scoreLeadsBatch } from "@/lib/lead-enrichment";

const twitterLeadUpsertQueue = queue({
  name: "twitter-lead-upsert",
  concurrencyLimit: 2,
});

interface TwitterLeadUpsertPayload {
  profileId: string;
  accountId: string;
  contactId: string | null;
  scrapeWindow?: "early" | "late";
}

interface DedupedEngager {
  firstName: string;
  lastName: string | null;
  twitterUrl: string;
  twitterHandle: string | null;
  headline: string | null;
  company: string | null;
  profileImageUrl: string | null;
  engagementTypes: string[];
  engagementPosts: string[];
  firstEngagedAt: Date;
  lastEngagedAt: Date;
}

function mergeInto(
  target: DedupedEngager,
  source: {
    engagementType: string;
    postUrl: string;
    engagedAt: Date;
    headline?: string | null;
    company?: string | null;
    profileImageUrl?: string | null;
    twitterHandle?: string | null;
  }
) {
  if (!target.engagementTypes.includes(source.engagementType)) {
    target.engagementTypes.push(source.engagementType);
  }
  if (source.postUrl && !target.engagementPosts.includes(source.postUrl)) {
    target.engagementPosts.push(source.postUrl);
  }
  if (source.headline && !target.headline) target.headline = source.headline;
  if (source.company && !target.company) target.company = source.company;
  if (source.profileImageUrl && !target.profileImageUrl) target.profileImageUrl = source.profileImageUrl;
  if (source.twitterHandle && !target.twitterHandle) target.twitterHandle = source.twitterHandle;
  if (source.engagedAt < target.firstEngagedAt) target.firstEngagedAt = source.engagedAt;
  if (source.engagedAt > target.lastEngagedAt) target.lastEngagedAt = source.engagedAt;
}

/** Parse a name like "First Last" from a single string */
function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || null };
}

/** Try to parse a company from a Twitter bio (very heuristic) */
function parseCompanyFromBio(bio: string | null): string | null {
  if (!bio) return null;
  // Look for "at Company" or "@ Company" or "| Company"
  const match = bio.match(/(?:at|@|\|)\s+([A-Z][A-Za-z0-9\s&.]+)/);
  return match?.[1]?.trim() || null;
}

export const twitterLeadUpsertTask = task({
  id: "twitter-lead-upsert",
  queue: twitterLeadUpsertQueue,
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async (payload: TwitterLeadUpsertPayload, { ctx }) => {
    const { profileId, accountId, contactId, scrapeWindow } = payload;

    try {
      // Load engagements (retweeters only — likes are not scrapable)
      const engagements = await db
        .select({
          authorName: twitterPostEngagements.authorName,
          authorHandle: twitterPostEngagements.authorHandle,
          authorTwitterUrl: twitterPostEngagements.authorTwitterUrl,
          authorBio: twitterPostEngagements.authorBio,
          authorCompany: twitterPostEngagements.authorCompany,
          authorProfileImage: twitterPostEngagements.authorProfileImage,
          engagementType: twitterPostEngagements.engagementType,
          engagedAt: twitterPostEngagements.engagedAt,
          postId: twitterPostEngagements.postId,
        })
        .from(twitterPostEngagements)
        .where(eq(twitterPostEngagements.profileId, profileId));

      // Load replies (repliers are also leads)
      const replies = await db
        .select({
          authorName: twitterPostReplies.authorName,
          authorHandle: twitterPostReplies.authorHandle,
          authorBio: twitterPostReplies.authorBio,
          authorTwitterUrl: twitterPostReplies.authorTwitterUrl,
          repliedAt: twitterPostReplies.repliedAt,
          postId: twitterPostReplies.postId,
        })
        .from(twitterPostReplies)
        .where(eq(twitterPostReplies.profileId, profileId));

      // Build post URL map
      const postIds = [...new Set([...engagements.map((e) => e.postId), ...replies.map((r) => r.postId)])];

      if (postIds.length === 0) {
        logger.info(`No engagements or replies for Twitter profile ${profileId}`);
        return { leadsFound: 0, leadsUpserted: 0 };
      }

      const postRows = await db
        .select({ id: twitterPosts.id, tweetUrl: twitterPosts.tweetUrl, content: twitterPosts.content })
        .from(twitterPosts)
        .where(eq(twitterPosts.profileId, profileId));
      const postUrlMap = new Map(postRows.map((p) => [p.id, p.tweetUrl]));
      const postContentMap = new Map(postRows.map((p) => [p.tweetUrl, p.content]));

      // Convert to common format for dedup
      type EngagerRecord = {
        firstName: string;
        lastName: string | null;
        twitterUrl: string;
        twitterHandle: string | null;
        headline: string | null;
        company: string | null;
        profileImageUrl: string | null;
        engagementType: string;
        postUrl: string;
        engagedAt: Date;
      };

      const allEngagers: EngagerRecord[] = [];

      for (const e of engagements) {
        if (!e.authorTwitterUrl && !e.authorHandle) continue;
        const { firstName, lastName } = splitName(e.authorName || e.authorHandle || "");
        allEngagers.push({
          firstName,
          lastName,
          twitterUrl: e.authorTwitterUrl || (e.authorHandle ? `https://x.com/${e.authorHandle}` : ""),
          twitterHandle: e.authorHandle ?? null,
          headline: e.authorBio ?? null,
          company: e.authorCompany || parseCompanyFromBio(e.authorBio),
          profileImageUrl: e.authorProfileImage ?? null,
          engagementType: e.engagementType,
          postUrl: postUrlMap.get(e.postId) || "",
          engagedAt: e.engagedAt ?? new Date(),
        });
      }

      for (const r of replies) {
        if (!r.authorTwitterUrl && !r.authorHandle) continue;
        const { firstName, lastName } = splitName(r.authorName || r.authorHandle || "");
        allEngagers.push({
          firstName,
          lastName,
          twitterUrl: r.authorTwitterUrl || (r.authorHandle ? `https://x.com/${r.authorHandle}` : ""),
          twitterHandle: r.authorHandle ?? null,
          headline: r.authorBio ?? null,
          company: parseCompanyFromBio(r.authorBio),
          profileImageUrl: null,
          engagementType: "reply",
          postUrl: postUrlMap.get(r.postId) || "",
          engagedAt: r.repliedAt ?? new Date(),
        });
      }

      if (allEngagers.length === 0) {
        logger.info(`No engagers with Twitter URLs for profile ${profileId}`);
        return { leadsFound: 0, leadsUpserted: 0 };
      }

      // Dedup by Twitter URL (normalised)
      const engagerMap = new Map<string, DedupedEngager>();
      for (const person of allEngagers) {
        if (!person.firstName) continue;
        const key = person.twitterUrl.replace(/\/$/, "").toLowerCase();
        const existing = engagerMap.get(key);
        if (existing) {
          mergeInto(existing, person);
        } else {
          engagerMap.set(key, {
            firstName: person.firstName,
            lastName: person.lastName,
            twitterUrl: person.twitterUrl,
            twitterHandle: person.twitterHandle,
            headline: person.headline,
            company: person.company,
            profileImageUrl: person.profileImageUrl,
            engagementTypes: [person.engagementType],
            engagementPosts: person.postUrl ? [person.postUrl] : [],
            firstEngagedAt: person.engagedAt,
            lastEngagedAt: person.engagedAt,
          });
        }
      }

      const uniqueEngagers = Array.from(engagerMap.values());
      logger.info(`Unique engagers after dedup: ${uniqueEngagers.length} (from ${allEngagers.length} raw)`);

      // Upsert into leads table (using twitterUrl)
      const twitterUrls = uniqueEngagers.map((e) => e.twitterUrl.replace(/\/$/, "").toLowerCase());
      const existingLeads =
        twitterUrls.length > 0
          ? await db
              .select()
              .from(leads)
              .where(and(eq(leads.accountId, accountId), inArray(leads.twitterUrl, twitterUrls)))
          : [];

      const existingMap = new Map(existingLeads.map((l) => [l.twitterUrl?.replace(/\/$/, "").toLowerCase() ?? "", l]));

      let upsertCount = 0;
      const newLeads: DedupedEngager[] = [];
      const newLeadIds: string[] = [];
      const now = new Date();

      await db.transaction(async (tx) => {
        for (const engager of uniqueEngagers) {
          const normalizedUrl = engager.twitterUrl.replace(/\/$/, "").toLowerCase();
          const existing = existingMap.get(normalizedUrl);

          if (existing) {
            const mergedTypes = [
              ...new Set([...((existing.engagementTypes as string[]) || []), ...engager.engagementTypes]),
            ];
            const mergedPosts = [
              ...new Set([...((existing.engagementPosts as string[]) || []), ...engager.engagementPosts]),
            ];
            const firstSeenAt =
              existing.firstSeenAt < engager.firstEngagedAt ? existing.firstSeenAt : engager.firstEngagedAt;
            const lastSeenAt =
              existing.lastSeenAt > engager.lastEngagedAt ? existing.lastSeenAt : engager.lastEngagedAt;

            await tx
              .update(leads)
              .set({
                engagementTypes: mergedTypes,
                engagementPosts: mergedPosts,
                firstSeenAt,
                lastSeenAt,
                headline: engager.headline || existing.headline,
                company: engager.company || existing.company,
                twitterHandle: engager.twitterHandle || existing.twitterHandle,
                profileImageUrl: engager.profileImageUrl || existing.profileImageUrl,
                updatedAt: now,
              })
              .where(eq(leads.id, existing.id));
          } else {
            const [inserted] = await tx
              .insert(leads)
              .values({
                accountId,
                contactId,
                firstName: engager.firstName,
                lastName: engager.lastName,
                twitterUrl: normalizedUrl,
                twitterHandle: engager.twitterHandle,
                headline: engager.headline,
                company: engager.company,
                profileImageUrl: engager.profileImageUrl,
                engagementTypes: engager.engagementTypes,
                engagementPosts: engager.engagementPosts,
                firstSeenAt: engager.firstEngagedAt,
                lastSeenAt: engager.lastEngagedAt,
              })
              .returning({ id: leads.id });
            newLeads.push(engager);
            newLeadIds.push(inserted.id);
          }
          upsertCount++;
        }
      });

      logger.info(`Upserted ${upsertCount} leads for account ${accountId} (${newLeads.length} new from Twitter)`);

      // Persist CSV and send Slack notification
      if (newLeads.length > 0 && (scrapeWindow === "early" || scrapeWindow === "late")) {
        try {
          const [account] = await db
            .select({ name: accounts.name })
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);
          const accountName = account?.name ?? accountId;

          const csvHeaders = ["firstName", "lastName", "TwitterProfileUrl", "TwitterHandle", "headline", "company"];
          const csvRows = [csvHeaders.join(",")];
          for (const lead of newLeads) {
            csvRows.push(
              [
                escapeCsv(lead.firstName),
                escapeCsv(lead.lastName || ""),
                escapeCsv(lead.twitterUrl),
                escapeCsv(lead.twitterHandle || ""),
                escapeCsv(lead.headline || ""),
                escapeCsv(lead.company || ""),
              ].join(",")
            );
          }
          const csvContent = csvRows.join("\n");
          const filename = `new-twitter-leads-${accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

          const windowBlurb =
            scrapeWindow === "early"
              ? "Early engagers (~6h after posting)"
              : "Late engagers (72h+ — sustained interest)";

          const allPostUrls = [...new Set(newLeads.flatMap((l) => l.engagementPosts))];
          const postSummaries = allPostUrls
            .map((url) => {
              const content = postContentMap.get(url) || "";
              const firstLine = content.split("\n").find((l) => l.trim()) || "";
              return firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine || url;
            })
            .filter(Boolean);
          const description =
            postSummaries.length > 0
              ? `Twitter ${windowBlurb}. Tweets: ${postSummaries.join("; ")}`
              : `Twitter ${windowBlurb}`;

          const [csvRecord] = await db
            .insert(leadCsvs)
            .values({
              accountId,
              contactId,
              profileId,
              scrapeWindow,
              description,
              filename,
              csvContent,
              leadCount: newLeads.length,
              postUrls: allPostUrls,
            })
            .returning({ id: leadCsvs.id });

          if (csvRecord && newLeadIds.length > 0) {
            await db.update(leads).set({ leadCsvId: csvRecord.id }).where(inArray(leads.id, newLeadIds));
          }

          logger.info(`Persisted Twitter lead CSV ${csvRecord.id} with ${newLeads.length} leads`);

          // Send Slack notification
          const slackBlurb =
            scrapeWindow === "early"
              ? "These are early Twitter engagers (~6h after posting)."
              : "These Twitter leads engaged over 72h — sustained interest.";
          const slackRes = await fetch(
            `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent("tarun@mvrxlabs.com")}`,
            { headers: { Authorization: `Bearer ${process.env.SLACKBOT_TOKEN}` } }
          );
          const slackData = await slackRes.json();
          if (slackData.ok) {
            await sendSlackFile(
              slackData.user.id,
              filename,
              csvContent,
              `${newLeads.length} new Twitter lead${newLeads.length === 1 ? "" : "s"} from *${accountName}*\n${slackBlurb}`
            );
            logger.info(`Sent new Twitter leads CSV to Tarun for ${accountName}`);
          }
        } catch (slackErr) {
          logger.error("Failed to send Twitter leads Slack notification", {
            error: slackErr instanceof Error ? slackErr.message : String(slackErr),
          });
        }
      }

      // Score new leads against account ICP definitions
      let leadsScored = 0;
      if (newLeads.length > 0 && newLeadIds.length > 0) {
        try {
          const activeIcps = await db
            .select({
              name: icpDefinitions.name,
              description: icpDefinitions.description,
              targetTitles: icpDefinitions.targetTitles,
              targetIndustries: icpDefinitions.targetIndustries,
              targetCompanySizes: icpDefinitions.targetCompanySizes,
              targetSignals: icpDefinitions.targetSignals,
            })
            .from(icpDefinitions)
            .where(and(eq(icpDefinitions.accountId, accountId), eq(icpDefinitions.active, true)));

          if (activeIcps.length > 0) {
            logger.info(`Scoring ${newLeads.length} new Twitter leads against ${activeIcps.length} ICP definition(s)`);

            const SCORING_BATCH_SIZE = 15;
            let totalCost = 0;
            const scoringNow = new Date();

            for (let i = 0; i < newLeads.length; i += SCORING_BATCH_SIZE) {
              const batch = newLeads.slice(i, i + SCORING_BATCH_SIZE);
              const batchIds = newLeadIds.slice(i, i + SCORING_BATCH_SIZE);

              const leadsForScoring = batch.map((engager, idx) => ({
                id: batchIds[idx],
                firstName: engager.firstName,
                lastName: engager.lastName,
                headline: engager.headline,
                company: engager.company,
                title: null,
                division: null,
                engagementTypes: engager.engagementTypes,
                engagementPostCount: engager.engagementPosts.length,
              }));

              const { results, cost } = await scoreLeadsBatch(
                leadsForScoring,
                activeIcps.map((icp) => ({
                  name: icp.name,
                  description: icp.description,
                  targetTitles: (icp.targetTitles as string[]) || [],
                  targetIndustries: (icp.targetIndustries as string[]) || [],
                  targetCompanySizes: (icp.targetCompanySizes as string[]) || [],
                  targetSignals: (icp.targetSignals as string[]) || [],
                }))
              );

              totalCost += cost;

              for (const [leadId, scoring] of results) {
                await db
                  .update(leads)
                  .set({
                    tier: scoring.tier,
                    rationale: scoring.rationale,
                    enrichedAt: scoringNow,
                    updatedAt: scoringNow,
                  })
                  .where(eq(leads.id, leadId));
                leadsScored++;
              }
            }

            logger.info(
              `ICP scoring complete: ${leadsScored}/${newLeads.length} Twitter leads scored, cost $${totalCost.toFixed(4)}`
            );
          }
        } catch (scoringErr) {
          logger.warn("ICP scoring failed for Twitter leads (leads were still upserted)", {
            error: scoringErr instanceof Error ? scoringErr.message : String(scoringErr),
          });
        }
      }

      return { leadsFound: allEngagers.length, leadsUpserted: upsertCount, newLeads: newLeads.length, leadsScored };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Twitter lead upsert failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "twitter-lead-upsert",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});
