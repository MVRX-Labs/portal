import { task, logger } from "@trigger.dev/sdk/v3";
import { generateComment, updateSlackCard } from "@/lib/engagement-bot";
import { getPost, updatePostStatus, getProfile } from "@/lib/engagement-bot-db";
import { getLinkedinPost, getLinkedinPostProfile, updateLinkedinPostStatus } from "@/lib/linkedin-sync-db";
import { sendSlackNotification } from "@/lib/slack";

interface SlackActionPayload {
  actionName: "comment" | "like" | "repost" | "skip";
  postId: string;
  channelId: string;
}

/**
 * Route to the correct DB based on post ID prefix.
 * "lpost_*" → new linkedin_posts table, "engpost_*" → old engagement_posts table.
 */
function isNewPost(postId: string): boolean {
  return postId.startsWith("lpost_");
}

async function resolvePost(postId: string) {
  if (isNewPost(postId)) {
    const post = await getLinkedinPost(postId);
    if (!post) return null;
    const profile = await getLinkedinPostProfile(post.profileId);
    return {
      post: {
        ...post,
        engagementStatus: post.engagementStatus || "pending",
      },
      profile: profile ? { displayName: profile.displayName, engagementPersona: profile.engagementPersona } : null,
      updateStatus: (status: string, comment?: string) => updateLinkedinPostStatus(postId, status, comment),
      getPost: () => getLinkedinPost(postId),
    };
  }
  const post = await getPost(postId);
  if (!post) return null;
  const profile = await getProfile(post.profileId);
  return {
    post,
    profile,
    updateStatus: (status: string, comment?: string) => updatePostStatus(postId, status, comment),
    getPost: () => getPost(postId),
  };
}

export const engagementSlackActionTask = task({
  id: "engagement-slack-action",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async (payload: SlackActionPayload, { ctx }) => {
    const { actionName, postId, channelId } = payload;

    try {
      const resolved = await resolvePost(postId);
      if (!resolved) {
        logger.warn(`Post ${postId} not found`);
        return;
      }

      const { post, profile, updateStatus } = resolved;

      // Atomically claim the post: sent_to_slack → processing (prevents duplicate actions)
      const claimed = await updateStatus("processing");
      if (!claimed) {
        logger.info(`Post ${postId} not in actionable state (${post.engagementStatus}), skipping`);
        return;
      }

      let comment: string | undefined;
      if (actionName === "comment") {
        const persona = ((profile as Record<string, unknown>)?.engagementPersona as string) || "";
        try {
          comment = await generateComment(post.content, persona || undefined);
        } catch (err) {
          logger.error(`Comment generation failed for post ${postId}: ${String(err)}`);
          await updateStatus("failed");
          const failedPost = await resolved.getPost();
          if (failedPost?.slackMessageTs && channelId && profile) {
            await updateSlackCard(channelId, failedPost.slackMessageTs, failedPost as never, profile, "failed");
          }
          return;
        }
      }

      const newStatus = actionName === "skip" ? "skip" : "awaiting_action";
      await updateStatus(newStatus, comment);

      const updatedPost = await resolved.getPost();
      if (updatedPost?.slackMessageTs && channelId && profile) {
        await updateSlackCard(channelId, updatedPost.slackMessageTs, updatedPost as never, profile, actionName);
      }

      logger.info(`Processed ${actionName} for post ${postId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Engagement Slack action failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "engagement-slack-action",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});
