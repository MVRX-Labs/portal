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
import { eq, and, ne } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import { sendSlackNotification } from "@/lib/slack";
import { escapeSlackMrkdwn, capSlackBlockText } from "@/lib/knowledge/helpers";

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

  // Fix 1: Fail closed — if secret is not configured, reject all requests
  if (!signingSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";

  // Fix 2: Reject stale/invalid requests (>5 minutes old) — guard against NaN bypass
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 403 });
  }

  if (!verifySlackSignature(signingSecret, rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
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
      // Fix 6: Return 500 so Slack retries; also notify via Slack for visibility
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-slack-events",
        userName: "system",
        error: `Failed to handle ${eventType} on ${channelId}/${messageTs}: ${errMsg}`.slice(0, 500),
        runId: "webhook",
      });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
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

  // Build the completed message text
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
  const rawContent = unit.content.slice(0, 500) + (unit.content.length > 500 ? "…" : "");
  const safeContent = escapeSlackMrkdwn(rawContent);
  const completedText = `✅ ~${emoji} ${safeContent}~\n_Marked done by <@${reactingUser}>_`;

  // Update the triggering digest message record
  await db
    .update(knowledgeDigestMessages)
    .set({ markedDone: true })
    .where(eq(knowledgeDigestMessages.id, digestMsg.id));

  // Edit the triggering Slack message — non-fatal if Slack fails (DB state is source of truth)
  try {
    await updateSlackMessage(channelId, messageTs, completedText, [
      { type: "section", text: { type: "mrkdwn", text: capSlackBlockText(completedText) } },
    ]);
  } catch (err) {
    // Don't throw — DB is already updated, Slack visual is secondary
    sendSlackNotification({
      tool: "knowledge-slack-events",
      userName: "system",
      error: `Failed to update Slack message for ${digestMsg.unitId}: ${err instanceof Error ? err.message : String(err)}`,
      runId: "webhook",
    }).catch(() => {}); // fire-and-forget
  }

  // Look up ALL other digest messages for the same unitId (other recipients' DMs)
  const otherDigestMsgs = await db
    .select()
    .from(knowledgeDigestMessages)
    .where(
      and(
        eq(knowledgeDigestMessages.unitId, digestMsg.unitId),
        ne(knowledgeDigestMessages.id, digestMsg.id),
      ),
    );

  for (const other of otherDigestMsgs) {
    if (other.markedDone) continue; // Already updated
    await db
      .update(knowledgeDigestMessages)
      .set({ markedDone: true })
      .where(eq(knowledgeDigestMessages.id, other.id));
    try {
      await updateSlackMessage(other.channelId, other.messageTs, completedText, [
        { type: "section", text: { type: "mrkdwn", text: capSlackBlockText(completedText) } },
      ]);
    } catch (err) {
      // Don't fail the whole handler for a secondary update error
      sendSlackNotification({
        tool: "knowledge-slack-events",
        userName: "system",
        error: `Failed to update digest message ${other.id} for other recipient: ${err instanceof Error ? err.message : String(err)}`,
        runId: "webhook",
      }).catch(() => {});
    }
  }
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
  const rawContent = unit.content.slice(0, 500) + (unit.content.length > 500 ? "…" : "");
  const content = escapeSlackMrkdwn(rawContent);
  const contextLine = `\nReact ✅ to mark done · ID: \`${digestMsg.unitId}\``;
  const restoredText = `${emoji} ${content}${contextLine}`;

  try {
    await updateSlackMessage(channelId, messageTs, restoredText, [
      { type: "section", text: { type: "mrkdwn", text: capSlackBlockText(restoredText) } },
    ]);
  } catch (err) {
    sendSlackNotification({
      tool: "knowledge-slack-events",
      userName: "system",
      error: `Failed to restore Slack message for ${digestMsg.unitId}: ${err instanceof Error ? err.message : String(err)}`,
      runId: "webhook",
    }).catch(() => {});
  }

  // Propagate reopen to all other recipients' DMs (mirror of handleReactionAdded)
  const otherDigestMsgs = await db
    .select()
    .from(knowledgeDigestMessages)
    .where(
      and(
        eq(knowledgeDigestMessages.unitId, digestMsg.unitId),
        ne(knowledgeDigestMessages.id, digestMsg.id),
      ),
    );

  for (const other of otherDigestMsgs) {
    if (!other.markedDone) continue; // Already open
    await db
      .update(knowledgeDigestMessages)
      .set({ markedDone: false })
      .where(eq(knowledgeDigestMessages.id, other.id));
    try {
      await updateSlackMessage(other.channelId, other.messageTs, restoredText, [
        { type: "section", text: { type: "mrkdwn", text: capSlackBlockText(restoredText) } },
      ]);
    } catch (err) {
      sendSlackNotification({
        tool: "knowledge-slack-events",
        userName: "system",
        error: `Failed to restore digest message ${other.id} for other recipient: ${err instanceof Error ? err.message : String(err)}`,
        runId: "webhook",
      }).catch(() => {});
    }
  }
}
