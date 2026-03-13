import { task, logger } from "@trigger.dev/sdk/v3";
import { generateComment, updateSlackCard } from "@/lib/engagement-bot";
import { getLinkedinPost, getLinkedinPostProfile, updateLinkedinPostStatus } from "@/lib/linkedin-sync-db";
import { sendSlackNotification } from "@/lib/slack";

interface SlackActionPayload {
  actionName: "comment" | "like" | "repost" | "skip";
  postId: string;
  channelId: string;
}

export const engagementSlackActionTask = task({
  id: "engagement-slack-action",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async (payload: SlackActionPayload, { ctx }) => {
    const { actionName, postId, channelId } = payload;

    try {
      const post = await getLinkedinPost(postId);
      if (!post) {
        logger.warn(`Post ${postId} not found`);
        return;
      }

      const profile = await getLinkedinPostProfile(post.profileId);

      // Atomically claim the post: sent_to_slack → processing (prevents duplicate actions)
      const claimed = await updateLinkedinPostStatus(postId, "processing");
      if (!claimed) {
        logger.info(`Post ${postId} not in actionable state (${post.engagementStatus}), skipping`);
        return;
      }

      let comment: string | undefined;
      if (actionName === "comment") {
        const persona = profile?.engagementPersona || "";
        try {
          comment = await generateComment(post.content, persona || undefined);
        } catch (err) {
          logger.error(`Comment generation failed for post ${postId}: ${String(err)}`);
          await updateLinkedinPostStatus(postId, "failed");
          const failedPost = await getLinkedinPost(postId);
          if (failedPost?.slackMessageTs && channelId && profile) {
            await updateSlackCard(channelId, failedPost.slackMessageTs, failedPost as never, profile, "failed");
          }
          return;
        }
      }

      const newStatus = actionName === "skip" ? "skip" : "awaiting_action";
      await updateLinkedinPostStatus(postId, newStatus, comment);

      const updatedPost = await getLinkedinPost(postId);
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
