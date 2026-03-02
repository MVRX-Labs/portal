export async function sendSlackNotification(message: {
  tool: string;
  error: string;
  runId: string;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not configured, skipping notification");
    return;
  }

  const payload = {
    text: `Tool Run Failed`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `:rotating_light: *Tool Run Failed*`,
            `*Tool:* ${message.tool}`,
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
