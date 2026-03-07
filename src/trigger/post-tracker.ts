/**
 * Track a single LinkedIn post — scrapes after a 4-hour delay, saves snapshot,
 * and reports performance back in the Slack thread.
 */

import { task, logger } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { managedPosts, managedPostSnapshots } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { scrapeProfilePosts, normalizePost } from "@/lib/engagement-bot";
import { sendAnalyticsSlackMessage } from "@/lib/slack";
import { sendSlackNotification } from "@/lib/slack";

interface TrackPostPayload {
  postUrl: string;
  accountId: string;
  profileId: string | null;
  channelId: string;
  threadTs: string;
}

export const trackPostTask = task({
  id: "track-post",
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: TrackPostPayload, { ctx }) => {
    const { postUrl, accountId, profileId, channelId, threadTs } = payload;

    try {
      logger.info("Scraping tracked post", { postUrl, accountId });

      // Scrape the single post URL via Apify
      const { rawPosts } = await scrapeProfilePosts(postUrl, 1);

      if (rawPosts.length === 0) {
        await sendAnalyticsSlackMessage(
          channelId,
          "Could not fetch this post. It may be private or the URL may be invalid.",
          [{ type: "section", text: { type: "mrkdwn", text: "Could not fetch this post. It may be private or the URL may be invalid." } }],
          { thread_ts: threadTs },
        );
        return { success: false, reason: "no_data" };
      }

      const raw = rawPosts[0];
      const normalized = normalizePost(raw);
      const repostsCount =
        (raw.numShares as number) ??
        (raw.repostsCount as number) ??
        (raw.reshareCount as number) ??
        0;

      const likes = normalized.likesCount;
      const comments = normalized.commentsCount;
      const reposts = typeof repostsCount === "number" ? Math.max(0, repostsCount) : 0;
      const totalEngagement = likes + comments + reposts;

      // If we have a managed profile, upsert the post and save a snapshot
      if (profileId && normalized.apifyPostId) {
        const [existing] = await db
          .select()
          .from(managedPosts)
          .where(
            and(
              eq(managedPosts.profileId, profileId),
              eq(managedPosts.apifyPostId, normalized.apifyPostId),
            ),
          );

        let postId: string;
        if (existing) {
          await db
            .update(managedPosts)
            .set({
              likesCount: likes,
              commentsCount: comments,
              repostsCount: reposts,
              postUrl: normalized.postUrl || existing.postUrl,
            })
            .where(eq(managedPosts.id, existing.id));
          postId = existing.id;
        } else {
          const [inserted] = await db
            .insert(managedPosts)
            .values({
              profileId,
              accountId,
              apifyPostId: normalized.apifyPostId,
              content: normalized.content.slice(0, 500),
              postUrl: normalized.postUrl || postUrl,
              likesCount: likes,
              commentsCount: comments,
              repostsCount: reposts,
              postedAt: normalized.postedAt,
            })
            .returning({ id: managedPosts.id });
          postId = inserted.id;
        }

        await db.insert(managedPostSnapshots).values({
          postId,
          profileId,
          accountId,
          likesCount: likes,
          commentsCount: comments,
          repostsCount: reposts,
        });
      }

      // Report back in Slack thread
      const snippet = normalized.content.length > 100
        ? normalized.content.slice(0, 100) + "..."
        : normalized.content || "(no text)";

      const blocks: Record<string, unknown>[] = [
        {
          type: "header",
          text: { type: "plain_text", text: "4-Hour Post Performance", emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `> ${snippet}` },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Likes*\n${likes.toLocaleString()}` },
            { type: "mrkdwn", text: `*Comments*\n${comments.toLocaleString()}` },
            { type: "mrkdwn", text: `*Reposts*\n${reposts.toLocaleString()}` },
            { type: "mrkdwn", text: `*Total Engagement*\n${totalEngagement.toLocaleString()}` },
          ],
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `<${postUrl}|View Post>` }],
        },
      ];

      await sendAnalyticsSlackMessage(
        channelId,
        `4-Hour Performance: ${likes} likes, ${comments} comments, ${reposts} reposts (${totalEngagement} total)`,
        blocks,
        { thread_ts: threadTs },
      );

      logger.info("Post tracking complete", { likes, comments, reposts, totalEngagement });
      return { success: true, likes, comments, reposts, totalEngagement };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Post tracking failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "track-post",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});
