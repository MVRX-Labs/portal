import { sendSlackNotification as sendSlack } from "../lib/slack.js";

export interface SlackNotificationInput {
  tool: string;
  error: string;
  runId: string;
}

export async function notifySlackFailure(input: SlackNotificationInput): Promise<void> {
  await sendSlack(input);
}
