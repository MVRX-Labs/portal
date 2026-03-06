import { task, logger } from "@trigger.dev/sdk/v3";
import { generateComment, updateSlackCard } from "@/lib/engagement-bot";
import { getPost, updatePostStatus, getProfile, getRecentComments } from "@/lib/engagement-bot-db";

interface SlackActionPayload {
  actionName: "comment" | "like" | "repost" | "skip";
  postId: string;
  channelId: string;
}

export const engagementSlackActionTask = task({
  id: "engagement-slack-action",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async (payload: SlackActionPayload) => {
    const { actionName, postId, channelId } = payload;

    const post = await getPost(postId);
    if (!post) {
      logger.warn(`Post ${postId} not found`);
      return;
    }

    const profile = await getProfile(post.profileId);

    // Atomically claim the post: sent_to_slack → processing (prevents duplicate actions)
    const claimed = await updatePostStatus(postId, "processing");
    if (!claimed) {
      logger.info(`Post ${postId} not in actionable state (${post.engagementStatus}), skipping`);
      return;
    }

    let comment: string | undefined;
    if (actionName === "comment") {
      const persona = profile?.engagementPersona || "";
      const previousComments = await getRecentComments(post.profileId, 5);
      try {
        comment = await generateComment(post.content, persona || undefined, previousComments);
      } catch (err) {
        logger.error(`Comment generation failed for post ${postId}: ${String(err)}`);
        await updatePostStatus(postId, "failed");
        const failedPost = await getPost(postId);
        if (failedPost?.slackMessageTs && channelId && profile) {
          await updateSlackCard(channelId, failedPost.slackMessageTs, failedPost, profile, "failed");
        }
        return;
      }
    }

    const newStatus = actionName === "skip" ? "skip" : "awaiting_action";
    await updatePostStatus(postId, newStatus, comment);

    const updatedPost = await getPost(postId);
    if (updatedPost?.slackMessageTs && channelId && profile) {
      await updateSlackCard(channelId, updatedPost.slackMessageTs, updatedPost, profile, actionName);
    }

    logger.info(`Processed ${actionName} for post ${postId}`);
  },
});
