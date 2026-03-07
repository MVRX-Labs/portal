/**
 * Track LinkedIn posts — scrapes after a delay, saves snapshots,
 * and reports performance back in the Slack thread as a single table.
 */

import { task, logger } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { managedPosts, managedPostSnapshots } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { scrapeProfilePosts, normalizePost } from "@/lib/engagement-bot";
import { sendAnalyticsSlackMessage } from "@/lib/slack";
import { sendSlackNotification } from "@/lib/slack";

interface TrackedPost {
  postUrl: string;
  profileId: string | null;
}

interface TrackPostPayload {
  posts: TrackedPost[];
  accountId: string;
  channelId: string;
  threadTs: string;
  label: string;
}

interface PostResult {
  postUrl: string;
  content: string;
  likes: number;
  comments: number;
  reposts: number;
  total: number;
  failed: boolean;
}

export const trackPostTask = task({
  id: "track-post",
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: TrackPostPayload, { ctx }) => {
    const { posts, accountId, channelId, threadTs, label } = payload;

    try {
      logger.info("Scraping tracked posts", { count: posts.length, accountId });

      const results: PostResult[] = [];

      for (const tracked of posts) {
        try {
          const { rawPosts } = await scrapeProfilePosts(tracked.postUrl, 1);

          if (rawPosts.length === 0) {
            results.push({
              postUrl: tracked.postUrl,
              content: "",
              likes: 0, comments: 0, reposts: 0, total: 0,
              failed: true,
            });
            continue;
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
          const reposts = typeof repostsCount === "number"
            ? Math.max(0, repostsCount) : 0;

          // Upsert + snapshot if we have a managed profile
          if (tracked.profileId && normalized.apifyPostId) {
            const [existing] = await db
              .select()
              .from(managedPosts)
              .where(
                and(
                  eq(managedPosts.profileId, tracked.profileId),
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
                  profileId: tracked.profileId,
                  accountId,
                  apifyPostId: normalized.apifyPostId,
                  content: normalized.content.slice(0, 500),
                  postUrl: normalized.postUrl || tracked.postUrl,
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
              profileId: tracked.profileId,
              accountId,
              likesCount: likes,
              commentsCount: comments,
              repostsCount: reposts,
            });
          }

          results.push({
            postUrl: tracked.postUrl,
            content: normalized.content,
            likes, comments, reposts,
            total: likes + comments + reposts,
            failed: false,
          });
        } catch (err) {
          logger.warn("Failed to scrape post", {
            postUrl: tracked.postUrl,
            error: err instanceof Error ? err.message : String(err),
          });
          results.push({
            postUrl: tracked.postUrl,
            content: "",
            likes: 0, comments: 0, reposts: 0, total: 0,
            failed: true,
          });
        }
      }

      // Build Slack message
      const blocks: Record<string, unknown>[] = [];
      const successful = results.filter((r) => !r.failed);
      const failed = results.filter((r) => r.failed);

      if (successful.length === 1) {
        // Single post — card format
        const r = successful[0];
        const snippet = r.content.length > 100
          ? r.content.slice(0, 100) + "..." : r.content || "(no text)";
        blocks.push(
          { type: "header", text: { type: "plain_text", text: `${label} Post Performance`, emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `> ${snippet}` } },
          { type: "section", fields: [
            { type: "mrkdwn", text: `*Likes*\n${r.likes.toLocaleString()}` },
            { type: "mrkdwn", text: `*Comments*\n${r.comments.toLocaleString()}` },
            { type: "mrkdwn", text: `*Reposts*\n${r.reposts.toLocaleString()}` },
            { type: "mrkdwn", text: `*Total*\n${r.total.toLocaleString()}` },
          ]},
          { type: "context", elements: [{ type: "mrkdwn", text: `<${r.postUrl}|View Post>` }] },
        );
      } else if (successful.length > 1) {
        // Multiple posts — table format
        blocks.push({
          type: "header",
          text: { type: "plain_text", text: `${label} Post Performance`, emoji: true },
        });

        const rows = successful.map((r, i) => {
          const snippet = r.content.length > 60
            ? r.content.slice(0, 60) + "..." : r.content || "(no text)";
          return `<${r.postUrl}|Post ${i + 1}>  —  ${snippet}\n` +
            `:thumbsup: ${r.likes}  :speech_balloon: ${r.comments}  :repeat: ${r.reposts}  ·  *${r.total} total*`;
        });

        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: rows.join("\n\n") },
        });

        // Totals row
        const totLikes = successful.reduce((s, r) => s + r.likes, 0);
        const totComments = successful.reduce((s, r) => s + r.comments, 0);
        const totReposts = successful.reduce((s, r) => s + r.reposts, 0);
        const totAll = successful.reduce((s, r) => s + r.total, 0);
        blocks.push({ type: "divider" });
        blocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `*Combined:* ${totLikes} likes · ${totComments} comments · ${totReposts} reposts · *${totAll} total*`,
          }],
        });
      }

      if (failed.length > 0) {
        const failedLinks = failed.map((r) => `<${r.postUrl}|link>`).join(", ");
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `Could not fetch: ${failedLinks}` }],
        });
      }

      if (blocks.length > 0) {
        const fallback = successful.map((r) =>
          `${r.likes} likes, ${r.comments} comments, ${r.reposts} reposts`,
        ).join(" | ");

        await sendAnalyticsSlackMessage(
          channelId,
          `${label} Performance: ${fallback}`,
          blocks,
          { thread_ts: threadTs },
        );
      }

      logger.info("Post tracking complete", { label, tracked: results.length });
      return { success: true, results };
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
