/**
 * Knowledge Hub — Slack Events API webhook
 *
 * POST /api/knowledge/slack-events
 *
 * Handles:
 *   - URL verification challenge
 *   - reaction_added / reaction_removed for ✅ (white_check_mark)
 *
 * When ✅ is added to a digest item message:
 *   1. Look up knowledge_digest_messages by messageTs + channelId
 *   2. Mark the knowledge_unit as done (update status + metadata)
 *   3. Update knowledge_digest_messages.markedDone = true
 *   4. Edit the Slack message to show completed (prepend ✅, strikethrough content)
 *
 * When ✅ is removed:
 *   - Reopen the unit (status → "open", remove completedAt)
 *   - Update markedDone = false
 *   - Restore the original Slack message
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeDigestMessages, knowledgeUnits } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

// ---------- Slack signature verification ----------

function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computed = `v0=${hmac}`;
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ---------- Slack API helpers ----------

function getToken(): string {
  const token = process.env.KNOWLEDGE_SLACKBOT_TOKEN;
  if (!token) throw new Error("KNOWLEDGE_SLACKBOT_TOKEN not configured");
  return token;
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

async function updateSlackMessage(
  channel: string,
  ts: string,
  text: string,
  blocks?: Record<string, unknown>[],
): Promise<void> {
  const body: Record<string, unknown> = { channel, ts, text };
  if (blocks) body.blocks = blocks;
  await slackPost("chat.update", body);
}

// ---------- Handler ----------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  // Slack signature verification
  const signingSecret = process.env.KNOWLEDGE_SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
    const signature = req.headers.get("x-slack-signature") ?? "";

    // Reject stale requests (>5 minutes old) to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
      return NextResponse.json({ error: "Request too old" }, { status: 403 });
    }

    if (!verifySlackSignature(signingSecret, rawBody, timestamp, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  } else {
    console.warn("[slack-events] KNOWLEDGE_SLACK_SIGNING_SECRET not set — skipping signature verification (dev mode)");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // URL verification challenge
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Event callback
  if (payload.type === "event_callback") {
    const event = payload.event as Record<string, unknown> | undefined;
    if (!event) return NextResponse.json({ ok: true });

    const eventType = event.type as string;
    const reaction = event.reaction as string;

    if (reaction !== "white_check_mark") {
      // Not a ✅ — ignore
      return NextResponse.json({ ok: true });
    }

    const item = event.item as Record<string, unknown> | undefined;
    const messageTs = item?.ts as string | undefined;
    const channelId = item?.channel as string | undefined;
    const reactingUser = event.user as string | undefined;

    if (!messageTs || !channelId) {
      return NextResponse.json({ ok: true });
    }

    try {
      if (eventType === "reaction_added") {
        await handleReactionAdded(channelId, messageTs, reactingUser ?? "unknown");
      } else if (eventType === "reaction_removed") {
        await handleReactionRemoved(channelId, messageTs);
      }
    } catch (err) {
      console.error("[slack-events] Error handling reaction:", err);
      // Still return 200 — Slack will retry on non-200
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleReactionAdded(channelId: string, messageTs: string, reactingUser: string): Promise<void> {
  // Look up the digest message record
  const [digestMsg] = await db
    .select()
    .from(knowledgeDigestMessages)
    .where(and(eq(knowledgeDigestMessages.messageTs, messageTs), eq(knowledgeDigestMessages.channelId, channelId)))
    .limit(1);

  if (!digestMsg) {
    // Not one of our tracked messages — ignore
    return;
  }

  if (digestMsg.markedDone) {
    // Already marked done — idempotent
    return;
  }

  // Fetch the knowledge unit to get current metadata
  const [unit] = await db
    .select({ metadata: knowledgeUnits.metadata, content: knowledgeUnits.content, unitType: knowledgeUnits.unitType })
    .from(knowledgeUnits)
    .where(eq(knowledgeUnits.id, digestMsg.unitId))
    .limit(1);

  if (!unit) return;

  const existingMeta = (unit.metadata as Record<string, unknown>) ?? {};

  // Mark unit as done
  await db
    .update(knowledgeUnits)
    .set({
      status: "done",
      metadata: {
        ...existingMeta,
        completedAt: new Date().toISOString(),
        completedBy: reactingUser,
      },
    })
    .where(eq(knowledgeUnits.id, digestMsg.unitId));

  // Update digest message record
  await db
    .update(knowledgeDigestMessages)
    .set({ markedDone: true })
    .where(eq(knowledgeDigestMessages.id, digestMsg.id));

  // Edit the Slack message to show it's completed
  const typeEmoji: Record<string, string> = {
    action_item: "🔹",
    decision: "⚖️",
    request: "📩",
    blocker: "🚫",
    deliverable: "📦",
    feedback: "💬",
    context_update: "📝",
    content_draft: "✍️",
    product_bug: "🐛",
    product_feature: "✨",
  };
  const emoji = typeEmoji[unit.unitType] || "🔹";
  const content = unit.content.slice(0, 500) + (unit.content.length > 500 ? "…" : "");
  const completedText = `✅ ~${emoji} ${content}~\n_Marked done by <@${reactingUser}>_`;

  await updateSlackMessage(channelId, messageTs, completedText, [
    { type: "section", text: { type: "mrkdwn", text: completedText } },
  ]);
}

async function handleReactionRemoved(channelId: string, messageTs: string): Promise<void> {
  // Look up the digest message record
  const [digestMsg] = await db
    .select()
    .from(knowledgeDigestMessages)
    .where(and(eq(knowledgeDigestMessages.messageTs, messageTs), eq(knowledgeDigestMessages.channelId, channelId)))
    .limit(1);

  if (!digestMsg) return;
  if (!digestMsg.markedDone) return; // Not done — nothing to undo

  // Fetch the knowledge unit
  const [unit] = await db
    .select({ metadata: knowledgeUnits.metadata, content: knowledgeUnits.content, unitType: knowledgeUnits.unitType })
    .from(knowledgeUnits)
    .where(eq(knowledgeUnits.id, digestMsg.unitId))
    .limit(1);

  if (!unit) return;

  const existingMeta = (unit.metadata as Record<string, unknown>) ?? {};
  const { completedAt: _ca, completedBy: _cb, ...restMeta } = existingMeta as {
    completedAt?: string;
    completedBy?: string;
    [key: string]: unknown;
  };

  // Reopen the unit
  await db
    .update(knowledgeUnits)
    .set({ status: "open", metadata: restMeta })
    .where(eq(knowledgeUnits.id, digestMsg.unitId));

  // Update digest message record
  await db
    .update(knowledgeDigestMessages)
    .set({ markedDone: false })
    .where(eq(knowledgeDigestMessages.id, digestMsg.id));

  // Restore the Slack message to its original open state
  const typeEmoji: Record<string, string> = {
    action_item: "🔹",
    decision: "⚖️",
    request: "📩",
    blocker: "🚫",
    deliverable: "📦",
    feedback: "💬",
    context_update: "📝",
    content_draft: "✍️",
    product_bug: "🐛",
    product_feature: "✨",
  };
  const emoji = typeEmoji[unit.unitType] || "🔹";
  const content = unit.content.slice(0, 500) + (unit.content.length > 500 ? "…" : "");
  const contextLine = `\nReact ✅ to mark done · ID: \`${digestMsg.unitId}\``;
  const restoredText = `${emoji} ${content}${contextLine}`;

  await updateSlackMessage(channelId, messageTs, restoredText, [
    { type: "section", text: { type: "mrkdwn", text: restoredText } },
  ]);
}
