import { task, logger } from "@trigger.dev/sdk/v3";
import { generateReply, updateTwitterSlackCard } from "@/lib/twitter-engagement-bot";
import { getTwitterPost, getTwitterPostProfile, updateTwitterPostStatus } from "@/lib/twitter-sync-db";
import { sendSlackNotification } from "@/lib/slack";

interface TwitterSlackActionPayload {
  actionName: "reply" | "like" | "retweet" | "skip";
  postId: string;
  channelId: string;
}

export const twitterEngagementSlackActionTask = task({
  id: "twitter-engagement-slack-action",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async (payload: TwitterSlackActionPayload, { ctx }) => {
    const { actionName, postId, channelId } = payload;

    try {
      const post = await getTwitterPost(postId);
      if (!post) {
        logger.warn(`Tweet ${postId} not found`);
        return;
      }

      const profile = await getTwitterPostProfile(post.profileId);

      // Atomically claim the post: sent_to_slack → processing
      const claimed = await updateTwitterPostStatus(postId, "processing");
      if (!claimed) {
        logger.info(`Tweet ${postId} not in actionable state (${post.engagementStatus}), skipping`);
        return;
      }

      let comment: string | undefined;
      if (actionName === "reply") {
        const persona = profile?.engagementPersona || "";
        try {
          comment = await generateReply(post.content, persona || undefined);
        } catch (err) {
          logger.error(`Reply generation failed for tweet ${postId}: ${String(err)}`);
          await updateTwitterPostStatus(postId, "failed");
          const failedPost = await getTwitterPost(postId);
          if (failedPost?.slackMessageTs && channelId && profile) {
            await updateTwitterSlackCard(channelId, failedPost.slackMessageTs, failedPost as any, profile, "failed");
          }
          return;
        }
      }

      const newStatus = actionName === "skip" ? "skip" : "awaiting_action";
      await updateTwitterPostStatus(postId, newStatus, comment);

      const updatedPost = await getTwitterPost(postId);
      if (updatedPost?.slackMessageTs && channelId && profile) {
        await updateTwitterSlackCard(channelId, updatedPost.slackMessageTs, updatedPost as any, profile, actionName);
      }

      logger.info(`Processed ${actionName} for tweet ${postId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Twitter engagement Slack action failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "twitter-engagement-slack-action",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});
