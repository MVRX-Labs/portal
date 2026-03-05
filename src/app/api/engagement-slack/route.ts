import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { tasks } from "@trigger.dev/sdk/v3";
import type { engagementSlackActionTask } from "@/trigger/engagement-slack-action";

function verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", secret).update(sigBasestring).digest("hex");
  const myBuf = Buffer.from(mySignature);
  const theirBuf = Buffer.from(signature);
  if (myBuf.length !== theirBuf.length) return false;
  return crypto.timingSafeEqual(myBuf, theirBuf);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const formData = new URLSearchParams(rawBody);
  const payloadStr = formData.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "No payload" }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== "block_actions") {
    return new NextResponse("", { status: 200 });
  }

  // Respond immediately, then process asynchronously via Trigger.dev
  const actions = payload.actions || [];
  const channelId = payload.channel?.id;

  let triggerFailed = false;
  for (const action of actions) {
    const actionId: string = action.action_id || "";
    const match = actionId.match(/^engage_(comment|like|repost|skip):(.+)$/);
    if (!match || !channelId) continue;

    const [, actionName, postId] = match;

    try {
      await tasks.trigger<typeof engagementSlackActionTask>("engagement-slack-action", {
        actionName: actionName as "comment" | "like" | "repost" | "skip",
        postId,
        channelId,
      });
    } catch (err) {
      console.error(`Failed to trigger slack action task for post ${postId}:`, err);
      triggerFailed = true;
    }
  }

  // Return 500 if trigger failed so Slack retries the action
  if (triggerFailed) {
    return new NextResponse("", { status: 500 });
  }
  return new NextResponse("", { status: 200 });
}
