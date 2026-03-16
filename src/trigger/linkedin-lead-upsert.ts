/**
 * linkedin-lead-upsert: Reads from linkedin_post_engagements and
 * linkedin_post_comments for inbound-enabled profiles and upserts leads.
 *
 * No Apify calls — all data is already in the DB from linkedin-sync.
 * Triggered after sync completes for profiles with inboundEnabled=true.
 */

import { task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { linkedinPostEngagements, linkedinPostComments, linkedinPosts, leads, leadCsvs, accounts } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sendSlackNotification, sendSlackFile } from "@/lib/slack";
import { escapeCsv } from "@/lib/csv";
import { parseCompanyFromHeadline, parseTitleFromHeadline, parseDivisionFromTitle } from "@/lib/linkedin-engagement";

const leadUpsertQueue = queue({
  name: "linkedin-lead-upsert",
  concurrencyLimit: 2,
});

interface LeadUpsertPayload {
  profileId: string;
  accountId: string;
  contactId: string | null;
  /** Label for Slack notification: "early", "late", or omitted */
  scrapeWindow?: "early" | "late";
}

interface DedupedEngager {
  firstName: string;
  lastName: string | null;
  linkedinUrl: string;
  linkedinUrnUrl: string | null;
  linkedinSlug: string | null;
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
    linkedinUrl: string;
    linkedinUrnUrl?: string | null;
    linkedinSlug?: string | null;
    headline?: string | null;
    company?: string | null;
    profileImageUrl?: string | null;
    engagementType: string;
    postUrl: string;
    engagedAt: Date;
  }
) {
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
  // Prefer slug URL over URN URL
  if (source.linkedinSlug && !target.linkedinSlug) {
    target.linkedinUrl = source.linkedinUrl;
    target.linkedinSlug = source.linkedinSlug;
  }
  if (source.engagedAt < target.firstEngagedAt) target.firstEngagedAt = source.engagedAt;
  if (source.engagedAt > target.lastEngagedAt) target.lastEngagedAt = source.engagedAt;
}

export const linkedinLeadUpsertTask = task({
  id: "linkedin-lead-upsert",
  queue: leadUpsertQueue,
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: async (payload: LeadUpsertPayload, { ctx }) => {
    const { profileId, accountId, contactId, scrapeWindow } = payload;

    try {
      // Load engagements (reactions + reposts) for this profile
      const engagements = await db
        .select({
          authorName: linkedinPostEngagements.authorName,
          authorLinkedinUrl: linkedinPostEngagements.authorLinkedinUrl,
          authorLinkedinSlug: linkedinPostEngagements.authorLinkedinSlug,
          authorHeadline: linkedinPostEngagements.authorHeadline,
          authorCompany: linkedinPostEngagements.authorCompany,
          authorProfileImage: linkedinPostEngagements.authorProfileImage,
          engagementType: linkedinPostEngagements.engagementType,
          engagedAt: linkedinPostEngagements.engagedAt,
          postId: linkedinPostEngagements.postId,
        })
        .from(linkedinPostEngagements)
        .where(eq(linkedinPostEngagements.profileId, profileId));

      // Load comments for this profile
      const comments = await db
        .select({
          authorName: linkedinPostComments.authorName,
          authorLinkedinUrl: linkedinPostComments.authorLinkedinUrl,
          authorHeadline: linkedinPostComments.authorHeadline,
          commentedAt: linkedinPostComments.commentedAt,
          postId: linkedinPostComments.postId,
        })
        .from(linkedinPostComments)
        .where(eq(linkedinPostComments.profileId, profileId));

      // Build post URL map
      const postIds = [...new Set([...engagements.map((e) => e.postId), ...comments.map((c) => c.postId)])];

      if (postIds.length === 0) {
        logger.info(`No engagements or comments for profile ${profileId}`);
        return { leadsFound: 0, leadsUpserted: 0 };
      }

      const postRows = await db
        .select({ id: linkedinPosts.id, postUrl: linkedinPosts.postUrl, content: linkedinPosts.content })
        .from(linkedinPosts)
        .where(eq(linkedinPosts.profileId, profileId));
      const postUrlMap = new Map(postRows.map((p) => [p.id, p.postUrl]));
      const postContentMap = new Map(postRows.map((p) => [p.postUrl, p.content]));

      // Convert to a common format for dedup
      type EngagerRecord = {
        firstName: string;
        lastName: string | null;
        linkedinUrl: string;
        linkedinUrnUrl: string | null;
        linkedinSlug: string | null;
        headline: string | null;
        company: string | null;
        profileImageUrl: string | null;
        engagementType: string;
        postUrl: string;
        engagedAt: Date;
      };

      const allEngagers: EngagerRecord[] = [];

      for (const e of engagements) {
        if (!e.authorLinkedinUrl) continue;
        const nameParts = (e.authorName || "").split(/\s+/);
        allEngagers.push({
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || null,
          linkedinUrl: e.authorLinkedinUrl,
          linkedinUrnUrl: /\/in\/ACo[A-Z]/i.test(e.authorLinkedinUrl) ? e.authorLinkedinUrl : null,
          linkedinSlug: e.authorLinkedinSlug ?? null,
          headline: e.authorHeadline ?? null,
          company: e.authorCompany ?? null,
          profileImageUrl: e.authorProfileImage ?? null,
          engagementType: e.engagementType,
          postUrl: postUrlMap.get(e.postId) || "",
          engagedAt: e.engagedAt ?? new Date(),
        });
      }

      for (const c of comments) {
        if (!c.authorLinkedinUrl) continue;
        const nameParts = (c.authorName || "").split(/\s+/);
        const slug = c.authorLinkedinUrl.match(/\/in\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null;
        const commentHeadline = c.authorHeadline ?? null;
        allEngagers.push({
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || null,
          linkedinUrl: c.authorLinkedinUrl,
          linkedinUrnUrl: /\/in\/ACo[A-Z]/i.test(c.authorLinkedinUrl) ? c.authorLinkedinUrl : null,
          linkedinSlug: slug,
          headline: commentHeadline,
          company: parseCompanyFromHeadline(commentHeadline),
          profileImageUrl: null,
          engagementType: "comment",
          postUrl: postUrlMap.get(c.postId) || "",
          engagedAt: c.commentedAt ?? new Date(),
        });
      }

      if (allEngagers.length === 0) {
        logger.info(`No engagers with LinkedIn URLs for profile ${profileId}`);
        return { leadsFound: 0, leadsUpserted: 0 };
      }

      // Pass 1: Dedup by URL
      const engagerMap = new Map<string, DedupedEngager>();
      for (const person of allEngagers) {
        if (!person.firstName) continue;
        const key = person.linkedinUrl.replace(/\/$/, "");
        const existing = engagerMap.get(key);
        if (existing) {
          mergeInto(existing, person);
        } else {
          engagerMap.set(key, {
            firstName: person.firstName,
            lastName: person.lastName,
            linkedinUrl: person.linkedinUrl,
            linkedinUrnUrl: person.linkedinUrnUrl,
            linkedinSlug: person.linkedinSlug,
            headline: person.headline,
            company: person.company,
            profileImageUrl: person.profileImageUrl,
            engagementTypes: [person.engagementType],
            engagementPosts: [person.postUrl].filter(Boolean),
            firstEngagedAt: person.engagedAt,
            lastEngagedAt: person.engagedAt,
          });
        }
      }

      // Pass 2: Merge URN-URL entries with slug-URL entries by name
      const nameMap = new Map<string, DedupedEngager>();
      const urlsToRemove: string[] = [];
      for (const [url, engager] of engagerMap) {
        const nameKey = `${engager.firstName.toLowerCase()}|${(engager.lastName || "").toLowerCase()}`;
        const byName = nameMap.get(nameKey);
        if (byName && byName !== engager) {
          const hasSlug = !engager.linkedinUrnUrl || engager.linkedinSlug;
          const otherHasSlug = !byName.linkedinUrnUrl || byName.linkedinSlug;

          if (hasSlug && !otherHasSlug) {
            mergeInto(engager, {
              ...byName,
              engagementType: byName.engagementTypes[0],
              postUrl: byName.engagementPosts[0] || "",
              engagedAt: byName.firstEngagedAt,
            });
            if (!engager.linkedinUrnUrl) engager.linkedinUrnUrl = byName.linkedinUrl;
            urlsToRemove.push(byName.linkedinUrl.replace(/\/$/, ""));
            nameMap.set(nameKey, engager);
          } else if (!hasSlug && otherHasSlug) {
            mergeInto(byName, {
              ...engager,
              engagementType: engager.engagementTypes[0],
              postUrl: engager.engagementPosts[0] || "",
              engagedAt: engager.firstEngagedAt,
            });
            if (!byName.linkedinUrnUrl) byName.linkedinUrnUrl = engager.linkedinUrl;
            urlsToRemove.push(url);
          }
        } else {
          nameMap.set(nameKey, engager);
        }
      }
      for (const url of urlsToRemove) {
        engagerMap.delete(url);
      }

      const uniqueEngagers = Array.from(engagerMap.values());
      logger.info(
        `Unique engagers after dedup: ${uniqueEngagers.length} (from ${allEngagers.length} raw, merged ${urlsToRemove.length} cross-URL dupes)`
      );

      // Upsert into leads table
      const linkedinUrls = uniqueEngagers.map((e) => e.linkedinUrl.replace(/\/$/, ""));
      const existingLeads =
        linkedinUrls.length > 0
          ? await db
              .select()
              .from(leads)
              .where(and(eq(leads.accountId, accountId), inArray(leads.linkedinUrl, linkedinUrls)))
          : [];

      const existingMap = new Map(existingLeads.map((l) => [l.linkedinUrl.replace(/\/$/, ""), l]));

      let upsertCount = 0;
      const newLeads: DedupedEngager[] = [];
      const newLeadIds: string[] = [];
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
            const firstSeenAt =
              existing.firstSeenAt < engager.firstEngagedAt ? existing.firstSeenAt : engager.firstEngagedAt;
            const lastSeenAt =
              existing.lastSeenAt > engager.lastEngagedAt ? existing.lastSeenAt : engager.lastEngagedAt;

            const updatedHeadline = engager.headline || existing.headline;
            const updatedTitle = existing.title || parseTitleFromHeadline(updatedHeadline);

            await tx
              .update(leads)
              .set({
                engagementTypes: mergedTypes,
                engagementPosts: mergedPosts,
                firstSeenAt,
                lastSeenAt,
                headline: updatedHeadline,
                company: engager.company || existing.company,
                title: updatedTitle,
                division: existing.division || parseDivisionFromTitle(updatedTitle),
                profileImageUrl: engager.profileImageUrl || existing.profileImageUrl,
                linkedinUrnUrl: engager.linkedinUrnUrl || existing.linkedinUrnUrl,
                updatedAt: now,
              })
              .where(eq(leads.id, existing.id));
          } else {
            const parsedTitle = parseTitleFromHeadline(engager.headline);
            const [inserted] = await tx
              .insert(leads)
              .values({
                accountId,
                contactId,
                linkedinUrl: normalizedUrl,
                linkedinUrnUrl: engager.linkedinUrnUrl,
                linkedinSlug: engager.linkedinSlug,
                firstName: engager.firstName,
                lastName: engager.lastName,
                headline: engager.headline,
                company: engager.company,
                title: parsedTitle,
                division: parseDivisionFromTitle(parsedTitle),
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

      logger.info(`Upserted ${upsertCount} leads for account ${accountId} (${newLeads.length} new)`);

      // Persist CSV and send Slack notification (only in early/late windows)
      if (newLeads.length > 0 && (scrapeWindow === "early" || scrapeWindow === "late")) {
        try {
          const [account] = await db
            .select({ name: accounts.name })
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);
          const accountName = account?.name ?? accountId;

          const csvHeaders = ["firstName", "lastName", "LinkedInProfileUrl", "headline", "company"];
          const csvRows = [csvHeaders.join(",")];
          for (const lead of newLeads) {
            csvRows.push(
              [
                escapeCsv(lead.firstName),
                escapeCsv(lead.lastName || ""),
                escapeCsv(lead.linkedinUrl),
                escapeCsv(lead.headline || ""),
                escapeCsv(lead.company || ""),
              ].join(",")
            );
          }
          const csvContent = csvRows.join("\n");
          const filename = `new-leads-${accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

          const windowBlurb =
            scrapeWindow === "early"
              ? "Early engagers (~6h after posting)"
              : "Late engagers (72h+ — sustained interest)";

          // Collect all post URLs from new leads
          const allPostUrls = [...new Set(newLeads.flatMap((l) => l.engagementPosts))];

          // Build description with post summaries
          const postSummaries = allPostUrls
            .map((url) => {
              const content = postContentMap.get(url) || "";
              const firstLine = content.split("\n").find((l) => l.trim()) || "";
              const summary = firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine;
              return summary || url;
            })
            .filter(Boolean);
          const description =
            postSummaries.length > 0 ? `${windowBlurb}. Posts: ${postSummaries.join("; ")}` : windowBlurb;

          // Persist CSV record
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

          // Link new leads to this CSV
          if (csvRecord && newLeadIds.length > 0) {
            await db.update(leads).set({ leadCsvId: csvRecord.id }).where(inArray(leads.id, newLeadIds));
          }

          logger.info(`Persisted lead CSV ${csvRecord.id} with ${newLeads.length} leads`);

          // Send Slack notification
          const slackBlurb =
            scrapeWindow === "early"
              ? "These are early engagers (~6h after posting) — great candidates for a quick follow-up."
              : "These leads engaged over 72h — they showed sustained interest in the post.";
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
              `${newLeads.length} new lead${newLeads.length === 1 ? "" : "s"} from *${accountName}*\n${slackBlurb}`
            );
            logger.info(`Sent new leads CSV to Tarun for ${accountName}`);
          } else {
            logger.warn(`Could not resolve Slack user for tarun@mvrxlabs.com: ${slackData.error}`);
          }
        } catch (slackErr) {
          logger.error("Failed to send new leads Slack notification", {
            error: slackErr instanceof Error ? slackErr.message : String(slackErr),
          });
        }
      }

      return { leadsFound: allEngagers.length, leadsUpserted: upsertCount, newLeads: newLeads.length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Lead upsert failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "linkedin-lead-upsert",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});
