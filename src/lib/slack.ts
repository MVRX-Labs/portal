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
