import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function sendSlackNotification(message: { tool: string; userName: string; error: string; runId: string }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not configured, skipping notification");
    return;
  }

  const payload = {
    text: `🚨 *Tool Run Failed*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `🚨 *Tool Run Failed*`,
            `*Tool:* ${message.tool}`,
            `*User:* ${message.userName}`,
            `*Error:* ${message.error}`,
            `*Run ID:* ${message.runId}`,
            `*Time:* ${new Date().toISOString()}`,
          ].join("\n"),
        },
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Failed to send Slack notification:", err);
  }
}

export async function sendSlackSuggestionNotification(message: {
  type: "pr_created" | "failed";
  toolId: string;
  description: string;
  userName: string;
  prUrl?: string;
  branchName?: string;
  error?: string;
  runId: string;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not configured, skipping notification");
    return;
  }

  const lines =
    message.type === "pr_created"
      ? [
          `🔧 *Suggestion PR Created*`,
          `*Tool:* ${message.toolId}`,
          `*Description:* ${message.description}`,
          `*Submitted by:* ${message.userName}`,
          `*Branch:* ${message.branchName}`,
          `*PR:* ${message.prUrl}`,
          `*Run ID:* ${message.runId}`,
        ]
      : [
          `❌ *Suggestion Failed*`,
          `*Tool:* ${message.toolId}`,
          `*Description:* ${message.description}`,
          `*Submitted by:* ${message.userName}`,
          `*Error:* ${message.error}`,
          `*Run ID:* ${message.runId}`,
          `*Time:* ${new Date().toISOString()}`,
        ];

  const payload = {
    text: lines[0],
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Failed to send Slack suggestion notification:", err);
  }
}

export async function resolveSlackUserId(userId: string, email: string): Promise<string | null> {
  const [user] = await db.select({ slackUserId: users.slackUserId }).from(users).where(eq(users.id, userId)).limit(1);

  if (user?.slackUserId) {
    return user.slackUserId;
  }

  const token = process.env.SLACKBOT_TOKEN;
  if (!token) {
    console.warn("SLACKBOT_TOKEN not configured, cannot resolve Slack user");
    return null;
  }

  try {
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!data.ok) {
      console.warn(`Slack lookupByEmail failed for ${email}: ${data.error}`);
      return null;
    }

    const slackUserId = data.user.id as string;

    await db.update(users).set({ slackUserId }).where(eq(users.id, userId));

    return slackUserId;
  } catch (err) {
    console.error("Failed to lookup Slack user by email:", err);
    return null;
  }
}

export async function sendSlackDM(slackUserId: string, text: string, blocks: Record<string, unknown>[]): Promise<void> {
  const token = process.env.SLACKBOT_TOKEN;
  if (!token) {
    console.warn("SLACKBOT_TOKEN not configured, skipping DM");
    return;
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: slackUserId, text, blocks }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack chat.postMessage failed: ${data.error}`);
  }
}

export async function sendSlackFile(
  slackUserId: string,
  filename: string,
  content: string,
  initialComment: string
): Promise<void> {
  const token = process.env.SLACKBOT_TOKEN;
  if (!token) {
    console.warn("SLACKBOT_TOKEN not configured, skipping file upload");
    return;
  }

  // Step 1: Get upload URL
  const uploadRes = await fetch(
    `https://slack.com/api/files.getUploadURLExternal?filename=${encodeURIComponent(filename)}&length=${Buffer.byteLength(content)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const uploadData = await uploadRes.json();
  if (!uploadData.ok) {
    throw new Error(`Slack files.getUploadURLExternal failed: ${uploadData.error}`);
  }

  // Step 2: Upload file content
  await fetch(uploadData.upload_url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: content,
  });

  // Step 3: Complete upload and share to user's DM
  const completeRes = await fetch("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: [{ id: uploadData.file_id, title: filename }],
      channel_id: slackUserId,
      initial_comment: initialComment,
    }),
  });
  const completeData = await completeRes.json();
  if (!completeData.ok) {
    throw new Error(`Slack files.completeUploadExternal failed: ${completeData.error}`);
  }
}
