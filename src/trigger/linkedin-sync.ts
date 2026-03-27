/**
 * linkedin-sync: LinkedIn profile sync.
 *
 * Scrapes all active linkedin_profiles every 30 minutes.
 * Handles posts, snapshots, comments, engagers, outbound Slack cards,
 * unreplied comment alerts, and triggers lead upserts.
 */

import { schedules, task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import {
  linkedinProfiles,
  linkedinPosts,
  linkedinPostSnapshots,
  linkedinPostComments,
  linkedinPostEngagements,
  linkedinSyncRuns,
} from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import { scrapeProfilePosts, extractAuthorName, sendPostToSlack } from "@/lib/linkedin-engagement-bot";
import { normalizeApifyPost } from "@/lib/linkedin-post-ingestion";
import { scrapePostReactions, scrapePostReshares, scrapePostComments } from "@/lib/linkedin-engagement";
import { extractLinkedinSlug } from "@/lib/linkedin-profiles";
import { sendSlackNotification, sendAnalyticsSlackMessage } from "@/lib/slack";
import { linkedinLeadUpsertTask } from "./linkedin-lead-upsert";
import { accounts, contacts } from "@/lib/schema";
import { isNull } from "drizzle-orm";
import { generateReplySuggestions, type ReplySuggestion } from "@/lib/linkedin-comment-reply-suggestions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max posts to fetch per profile per sync */
const MAX_POSTS_PER_SYNC = 7; // Assuming profiles don't make more than 7 posts per week

/** Only set engagement_status=pending on posts newer than this for outbound */
const OUTBOUND_MAX_AGE_DAYS = 1;

/** Only scrape comments on posts newer than this */
const COMMENT_SCRAPE_MAX_AGE_DAYS = 3;

/** Early engager window: 6–7 hours after posting */
const EARLY_WINDOW_MIN_H = 5;
const EARLY_WINDOW_MAX_H = 8;

/** Late engager window: 72–73 hours after posting */
const LATE_WINDOW_MIN_H = 72;
const LATE_WINDOW_MAX_H = 75;

const linkedinSyncQueue = queue({
  name: "linkedin-sync",
  concurrencyLimit: 3,
});

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export const linkedinSyncScheduler = schedules.task({
  id: "linkedin-sync-scheduler",
  cron: "5 */2 * * *",
  run: async (_payload, { ctx }) => {
    try {
      const profiles = await db
        .select({ id: linkedinProfiles.id, accountId: linkedinProfiles.accountId })
        .from(linkedinProfiles)
        .where(
          and(
            eq(linkedinProfiles.active, true),
            or(
              eq(linkedinProfiles.inboundEnabled, true),
              eq(linkedinProfiles.analyticsEnabled, true),
              eq(linkedinProfiles.outboundEnabled, true)
            )
          )
        );

      if (profiles.length === 0) {
        logger.info("No active linkedin profiles to sync");
        return { profileCount: 0 };
      }

      await linkedinSyncProfileTask.batchTrigger(
        profiles.map((p) => ({
          payload: { profileId: p.id, accountId: p.accountId },
        }))
      );

      logger.info(`Triggered sync for ${profiles.length} profiles`);
      return { profileCount: profiles.length };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "linkedin-sync-scheduler",
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

export const linkedinSyncProfileTask = task({
  id: "linkedin-sync-profile",
  queue: linkedinSyncQueue,
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async (payload: { profileId: string; accountId: string }, { ctx }) => {
    const { profileId, accountId } = payload;

    // Load profile
    const [profile] = await db.select().from(linkedinProfiles).where(eq(linkedinProfiles.id, profileId));

    if (!profile) {
      logger.warn(`Profile ${profileId} not found, skipping`);
      return { skipped: true };
    }

    // Create sync run record
    const [syncRun] = await db
      .insert(linkedinSyncRuns)
      .values({
        profileId,
        accountId,
        status: "running",
        triggerRunId: ctx.run.id,
      })
      .returning();

    try {
      // Step 1: Scrape recent posts via Apify
      logger.info(`Scraping posts for ${profile.displayName || profile.linkedinUrl}`);
      const { runId: apifyRunId, rawPosts } = await scrapeProfilePosts(profile.linkedinUrl, MAX_POSTS_PER_SYNC);

      await db.update(linkedinSyncRuns).set({ apifyRunId }).where(eq(linkedinSyncRuns.id, syncRun.id));

      // Step 2: Normalize and filter
      const expectedSlug = profile.linkedinSlug?.toLowerCase() || extractLinkedinSlug(profile.linkedinUrl) || undefined;

      const normalizedPosts = rawPosts
        .map((raw) =>
          normalizeApifyPost(raw, {
            expectedLinkedinSlug: expectedSlug,
            expectedLinkedinUrl: profile.linkedinUrl,
          })
        )
        .filter((p): p is NonNullable<typeof p> => p !== null);

      // Deduplicate by apifyPostId
      const postsByApifyId = new Map(normalizedPosts.map((p) => [p.apifyPostId, p]));
      const posts = Array.from(postsByApifyId.values());
      logger.info(`Normalized ${posts.length} posts from ${rawPosts.length} raw items`);

      // Step 3: Fetch existing posts for this profile
      const existingPosts = await db.select().from(linkedinPosts).where(eq(linkedinPosts.profileId, profileId));

      const existingByApifyId = new Map(existingPosts.map((p) => [p.apifyPostId, p]));

      // Auto-populate displayName from first post's author if missing
      if (!profile.displayName && rawPosts.length > 0) {
        const authorName = extractAuthorName(rawPosts[0]);
        if (authorName) {
          await db
            .update(linkedinProfiles)
            .set({ displayName: authorName, updatedAt: new Date() })
            .where(eq(linkedinProfiles.id, profileId));
        }
      }

      // Step 4: Upsert posts and create snapshots
      let newCount = 0;
      const outboundCutoff = new Date(Date.now() - OUTBOUND_MAX_AGE_DAYS * 24 * 3_600_000);
      const upsertedPosts: Array<{
        id: string;
        postUrl: string;
        postedAt: Date | null;
        earlyEngagersScrapedAt: Date | null;
        lateEngagersScrapedAt: Date | null;
      }> = [];

      for (const p of posts) {
        const existing = existingByApifyId.get(p.apifyPostId);

        let postId: string;
        let earlyScraped: Date | null = null;
        let lateScraped: Date | null = null;

        if (existing) {
          await db
            .update(linkedinPosts)
            .set({
              likesCount: p.likesCount,
              commentsCount: p.commentsCount,
              repostsCount: p.repostsCount,
              content: p.content || existing.content,
              postUrl: p.postUrl || existing.postUrl,
              postedAt: p.postedAt ?? existing.postedAt,
            })
            .where(eq(linkedinPosts.id, existing.id));
          postId = existing.id;
          earlyScraped = existing.earlyEngagersScrapedAt;
          lateScraped = existing.lateEngagersScrapedAt;
        } else {
          // For outbound-enabled profiles, new recent posts start as "pending"
          const isRecentEnough = !p.postedAt || p.postedAt >= outboundCutoff;
          const engagementStatus = profile.outboundEnabled && isRecentEnough ? "pending" : null;

          const [inserted] = await db
            .insert(linkedinPosts)
            .values({
              profileId,
              accountId,
              apifyPostId: p.apifyPostId,
              content: p.content,
              postUrl: p.postUrl,
              likesCount: p.likesCount,
              commentsCount: p.commentsCount,
              repostsCount: p.repostsCount,
              postedAt: p.postedAt,
              engagementStatus,
            })
            .returning({ id: linkedinPosts.id });
          postId = inserted.id;
          newCount++;
        }

        // Create snapshot
        await db.insert(linkedinPostSnapshots).values({
          postId,
          profileId,
          accountId,
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
          repostsCount: p.repostsCount,
        });

        upsertedPosts.push({
          id: postId,
          postUrl: p.postUrl,
          postedAt: p.postedAt,
          earlyEngagersScrapedAt: earlyScraped,
          lateEngagersScrapedAt: lateScraped,
        });
      }

      logger.info(`Upserted ${posts.length} posts (${newCount} new), created ${posts.length} snapshots`);

      // Step 5: Scrape comments on posts ≤7 days old
      const now = Date.now();
      const commentCutoff = now - COMMENT_SCRAPE_MAX_AGE_DAYS * 24 * 3_600_000;
      const commentEligible = upsertedPosts.filter((p) => p.postedAt && p.postedAt.getTime() >= commentCutoff);

      if (commentEligible.length > 0) {
        logger.info(`Scraping comments on ${commentEligible.length} posts (≤${COMMENT_SCRAPE_MAX_AGE_DAYS}d old)`);
        for (const post of commentEligible) {
          try {
            await scrapeAndUpsertComments(post.id, profileId, accountId, post.postUrl, expectedSlug);
          } catch (err) {
            logger.warn(
              `Failed to scrape comments for post ${post.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // Step 6: Scrape engagers at windowed intervals (~6h and ~72h)
      let engagerWindowsScraped = 0;
      let lastScrapeWindow: "early" | "late" | undefined;
      for (const post of upsertedPosts) {
        if (!post.postedAt) continue;
        const ageHours = (now - post.postedAt.getTime()) / 3_600_000;

        // Early window: ~6–7h
        if (ageHours >= EARLY_WINDOW_MIN_H && ageHours <= EARLY_WINDOW_MAX_H && !post.earlyEngagersScrapedAt) {
          try {
            logger.info(`Early window scrape for post ${post.id} (${ageHours.toFixed(1)}h old)`);
            await scrapeAndUpsertEngagers(post.id, profileId, accountId, post.postUrl, "early", post.postedAt);
            await db
              .update(linkedinPosts)
              .set({ earlyEngagersScrapedAt: new Date() })
              .where(eq(linkedinPosts.id, post.id));
            engagerWindowsScraped++;
            lastScrapeWindow = "early";
          } catch (err) {
            logger.warn(
              `Failed early engager scrape for post ${post.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // Late window: ~72–73h
        if (ageHours >= LATE_WINDOW_MIN_H && ageHours <= LATE_WINDOW_MAX_H && !post.lateEngagersScrapedAt) {
          try {
            logger.info(`Late window scrape for post ${post.id} (${ageHours.toFixed(1)}h old)`);
            await scrapeAndUpsertEngagers(post.id, profileId, accountId, post.postUrl, "late", post.postedAt);
            await db
              .update(linkedinPosts)
              .set({ lateEngagersScrapedAt: new Date() })
              .where(eq(linkedinPosts.id, post.id));
            engagerWindowsScraped++;
            lastScrapeWindow = "late";
          } catch (err) {
            logger.warn(
              `Failed late engager scrape for post ${post.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // Step 6b: Trigger lead upsert for inbound profiles when engagers were scraped
      if (profile.inboundEnabled && engagerWindowsScraped > 0) {
        try {
          await linkedinLeadUpsertTask.trigger({
            profileId,
            accountId,
            contactId: profile.contactId,
            scrapeWindow: lastScrapeWindow,
          });
          logger.info(`Triggered lead upsert for profile ${profileId} (${engagerWindowsScraped} windows scraped)`);
        } catch (err) {
          logger.warn(`Failed to trigger lead upsert: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 7: Outbound engagement — send new posts to Slack
      let slackSent = 0;
      if (profile.outboundEnabled) {
        const [account] = await db
          .select({ engagementSlackChannel: accounts.engagementSlackChannel })
          .from(accounts)
          .where(eq(accounts.id, accountId));

        const channelId = account?.engagementSlackChannel;
        if (channelId) {
          // Atomically claim pending posts (pending → sending)
          const claimed = await db
            .update(linkedinPosts)
            .set({ engagementStatus: "sending" })
            .where(and(eq(linkedinPosts.profileId, profileId), eq(linkedinPosts.engagementStatus, "pending")))
            .returning();

          // Reload profile to get latest displayName
          const [freshProfile] = await db.select().from(linkedinProfiles).where(eq(linkedinProfiles.id, profileId));

          for (const post of claimed) {
            try {
              const postForCard = { ...post, engagementStatus: post.engagementStatus || "pending" };
              const ts = await sendPostToSlack(
                channelId,
                postForCard as typeof postForCard & { engagementStatus: string },
                {
                  displayName: freshProfile?.displayName || profile.displayName || "",
                }
              );
              await db
                .update(linkedinPosts)
                .set({ engagementStatus: "sent_to_slack", slackMessageTs: ts })
                .where(and(eq(linkedinPosts.id, post.id), eq(linkedinPosts.engagementStatus, "sending")));
              slackSent++;
            } catch (err) {
              logger.warn(
                `Failed to send Slack card for post ${post.id}: ${err instanceof Error ? err.message : String(err)}`
              );
              // Revert to pending for next run
              await db
                .update(linkedinPosts)
                .set({ engagementStatus: "pending" })
                .where(and(eq(linkedinPosts.id, post.id), eq(linkedinPosts.engagementStatus, "sending")));
            }
          }

          if (claimed.length > 0) {
            logger.info(`Outbound: sent ${slackSent}/${claimed.length} posts to Slack`);
          }
        }
      }

      // Step 8: Unreplied comment alerts
      if (profile.analyticsEnabled) {
        try {
          const alertsSent = await sendUnrepliedCommentAlerts(
            profileId,
            accountId,
            profile.displayName || profile.linkedinUrl
          );
          if (alertsSent > 0) {
            logger.info(`Sent ${alertsSent} unreplied comment alert(s)`);
          }
        } catch (err) {
          logger.warn(`Failed to send unreplied comment alerts: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 9: Update profile sync state
      await db
        .update(linkedinProfiles)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(linkedinProfiles.id, profileId));

      // Step 10: Mark sync run complete
      await db
        .update(linkedinSyncRuns)
        .set({
          status: "completed",
          postsFound: posts.length,
          postsNew: newCount,
          completedAt: new Date(),
        })
        .where(eq(linkedinSyncRuns.id, syncRun.id));

      logger.info(
        `Sync complete for ${profile.displayName || profile.linkedinUrl}: ${posts.length} posts (${newCount} new)`
      );

      return {
        postsFound: posts.length,
        postsNew: newCount,
        commentsScraped: commentEligible.length,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      await db
        .update(linkedinSyncRuns)
        .set({
          status: "failed",
          errorMessage: errMsg,
          completedAt: new Date(),
        })
        .where(eq(linkedinSyncRuns.id, syncRun.id));

      await sendSlackNotification({
        tool: "linkedin-sync-profile",
        userName: "system",
        error: `Profile ${profile.displayName || profileId}: ${errMsg}`,
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
 * Scrape comments for a post via Apify and upsert into linkedin_post_comments.
 * Also computes replied_to_by_owner by matching comment author against the profile slug.
 */
async function scrapeAndUpsertComments(
  postId: string,
  profileId: string,
  accountId: string,
  postUrl: string,
  ownerSlug: string | undefined
) {
  const comments = await scrapePostComments(postUrl);

  if (comments.length === 0) return;

  logger.info(`Upserting ${comments.length} comments for post ${postId}`);

  for (const c of comments) {
    const isOwner = ownerSlug ? c.authorSlug?.toLowerCase() === ownerSlug.toLowerCase() : false;

    await db
      .insert(linkedinPostComments)
      .values({
        postId,
        profileId,
        accountId,
        commentUrn: c.commentId,
        authorName: c.authorName,
        authorLinkedinUrl: c.authorProfileUrl,
        authorHeadline: c.authorHeadline,
        commentText: c.text,
        commentUrl: c.commentUrl,
        commentedAt: c.postedAt,
        isReply: c.isReply,
        parentCommentId: c.parentCommentId,
        repliedToByOwner: false,
      })
      .onConflictDoUpdate({
        target: [linkedinPostComments.postId, linkedinPostComments.commentUrn],
        set: {
          commentText: c.text,
          authorHeadline: c.authorHeadline,
          commentUrl: c.commentUrl,
        },
      });

    // If this person IS the owner, mark any existing top-level comments
    // on this post as replied-to
    if (isOwner) {
      await db
        .update(linkedinPostComments)
        .set({ repliedToByOwner: true })
        .where(
          and(
            eq(linkedinPostComments.postId, postId),
            eq(linkedinPostComments.isReply, false),
            eq(linkedinPostComments.repliedToByOwner, false)
          )
        );
    }
  }
}

/**
 * Scrape reactions and reposts for a post via Apify and upsert into linkedin_post_engagements.
 */
async function scrapeAndUpsertEngagers(
  postId: string,
  profileId: string,
  accountId: string,
  postUrl: string,
  window: "early" | "late",
  engagedAt: Date
) {
  const [reactions, reshares] = await Promise.all([
    scrapePostReactions(postUrl, undefined, undefined, engagedAt),
    scrapePostReshares(postUrl, undefined, undefined, engagedAt),
  ]);

  const allEngagers = [
    ...reactions.map((e) => ({ ...e, engagementType: "reaction" as const })),
    ...reshares.map((e) => ({ ...e, engagementType: "repost" as const })),
  ];

  if (allEngagers.length === 0) return;

  logger.info(
    `Upserting ${allEngagers.length} engagers (${reactions.length} reactions, ${reshares.length} reposts) for post ${postId} [${window}]`
  );

  for (const e of allEngagers) {
    await db
      .insert(linkedinPostEngagements)
      .values({
        postId,
        profileId,
        accountId,
        authorName: [e.firstName, e.lastName].filter(Boolean).join(" "),
        authorLinkedinUrl: e.linkedinUrl,
        authorLinkedinSlug: e.linkedinSlug,
        authorHeadline: e.headline,
        authorCompany: e.company,
        authorProfileImage: e.profileImageUrl,
        engagementType: e.engagementType,
        engagedAt: e.engagedAt,
        scrapeWindow: window,
      })
      .onConflictDoNothing();
  }
}

/**
 * Check for unreplied top-level comments (within last 7 days, not yet notified)
 * and send a Slack alert to the account's analytics channel.
 */
async function sendUnrepliedCommentAlerts(
  profileId: string,
  accountId: string,
  profileDisplayName: string
): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000);

  // Find unreplied, unnotified, top-level comments from last 7 days
  const unreplied = await db
    .select({
      id: linkedinPostComments.id,
      postId: linkedinPostComments.postId,
      authorName: linkedinPostComments.authorName,
      authorLinkedinUrl: linkedinPostComments.authorLinkedinUrl,
      authorHeadline: linkedinPostComments.authorHeadline,
      commentText: linkedinPostComments.commentText,
      commentUrl: linkedinPostComments.commentUrl,
      commentedAt: linkedinPostComments.commentedAt,
    })
    .from(linkedinPostComments)
    .where(
      and(
        eq(linkedinPostComments.profileId, profileId),
        eq(linkedinPostComments.repliedToByOwner, false),
        eq(linkedinPostComments.isReply, false),
        isNull(linkedinPostComments.notifiedAt)
      )
    );

  // Filter to last 7 days in JS (simpler than adding gte to the query)
  const recent = unreplied.filter((c) => c.commentedAt && c.commentedAt >= sevenDaysAgo);

  if (recent.length === 0) return 0;

  // Get the analytics Slack channel and voice guidance for this account
  const [account] = await db
    .select({
      analyticsSlackChannel: accounts.analyticsSlackChannel,
      contentVoiceGuidance: accounts.contentVoiceGuidance,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const channelId = account?.analyticsSlackChannel;
  if (!channelId) return 0;

  // Try to get contact-level voice guidance (more specific than account-level)
  let voiceGuidance = account.contentVoiceGuidance;
  const [profile] = await db
    .select({ contactId: linkedinProfiles.contactId })
    .from(linkedinProfiles)
    .where(eq(linkedinProfiles.id, profileId))
    .limit(1);
  if (profile?.contactId) {
    const [contact] = await db
      .select({ contentVoiceGuidance: contacts.contentVoiceGuidance })
      .from(contacts)
      .where(eq(contacts.id, profile.contactId))
      .limit(1);
    if (contact?.contentVoiceGuidance) {
      voiceGuidance = contact.contentVoiceGuidance;
    }
  }

  // Group by post
  const byPost = new Map<string, typeof recent>();
  for (const c of recent) {
    const existing = byPost.get(c.postId) || [];
    existing.push(c);
    byPost.set(c.postId, existing);
  }

  // Load post details for the snippet
  const postIds = Array.from(byPost.keys());
  const allProfilePosts = await db
    .select({ id: linkedinPosts.id, content: linkedinPosts.content, postUrl: linkedinPosts.postUrl })
    .from(linkedinPosts)
    .where(eq(linkedinPosts.profileId, profileId));
  const postMap = new Map(
    allProfilePosts.filter((p) => postIds.includes(p.id)).map((p) => [p.id, { content: p.content, postUrl: p.postUrl }])
  );

  // Generate AI reply suggestions (graceful degradation on failure)
  let replySuggestions = new Map<string, ReplySuggestion>();
  try {
    replySuggestions = await generateReplySuggestions(
      {
        profileDisplayName,
        contentVoiceGuidance: voiceGuidance ?? null,
        comments: recent.map((c) => ({
          id: c.id,
          postId: c.postId,
          authorName: c.authorName,
          authorHeadline: c.authorHeadline ?? null,
          commentText: c.commentText,
        })),
        posts: new Map(Array.from(postMap.entries()).map(([id, p]) => [id, { id, content: p.content }])),
      },
      logger
    );
    logger.info(`Generated ${replySuggestions.size} reply suggestions for ${recent.length} comments`);
  } catch (err) {
    logger.warn(
      `Failed to generate reply suggestions, sending alert without them: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Build Slack blocks
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Unreplied Comments — ${profileDisplayName}` },
    },
  ];

  for (const [postId, comments] of byPost) {
    const post = postMap.get(postId);
    const rawSnippet = post?.content
      ? post.content.length > 80
        ? post.content.slice(0, 80) + "..."
        : post.content
      : "(post)";
    // Replace newlines with spaces so Slack _italic_ markers work correctly
    const snippet = rawSnippet.replace(/\n+/g, " ");
    const postLink = post?.postUrl ? `<${post.postUrl}|View post>` : "";

    const commenterLines = comments
      .slice(0, 5)
      .map((c) => {
        const name = c.authorName || "Someone";
        const link = c.authorLinkedinUrl ? `<${c.authorLinkedinUrl}|${name}>` : name;
        const preview = c.commentText ? ` — "${c.commentText}"` : "";
        const commentLink = c.commentUrl ? ` (<${c.commentUrl}|view>)` : "";
        let line = `  ${link}${preview}${commentLink}`;

        const suggestion = replySuggestions.get(c.id);
        if (suggestion) {
          const replyText = suggestion.reply.length > 300 ? suggestion.reply.slice(0, 297) + "..." : suggestion.reply;
          line += `\n      _Suggested reply:_ "${replyText}"`;
        }

        return line;
      })
      .join("\n");

    const moreCount = comments.length > 5 ? `\n  _...and ${comments.length - 5} more_` : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${comments.length} unreplied comment${comments.length > 1 ? "s" : ""}* on: _${snippet}_ ${postLink}\n${commenterLines}${moreCount}`,
      },
    });
  }

  // Send to all configured channels
  const channelIds = channelId
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  for (const ch of channelIds) {
    await sendAnalyticsSlackMessage(
      ch,
      `${recent.length} unreplied comment${recent.length > 1 ? "s" : ""} on ${profileDisplayName}'s posts`,
      blocks
    );
  }

  // Mark as notified
  const commentIds = recent.map((c) => c.id);
  for (const cId of commentIds) {
    await db.update(linkedinPostComments).set({ notifiedAt: new Date() }).where(eq(linkedinPostComments.id, cId));
  }

  return byPost.size;
}
