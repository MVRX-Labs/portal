/**
 * Knowledge Hub — Single Channel API
 *
 * PATCH: Toggle active, update settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeChannels, knowledgeSyncState } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchChannelBodySchema } from "@/lib/api-schemas/knowledge";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = req.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  const { data, error } = await parseBody(req, patchChannelBodySchema);
  if (error) return error;

  const updates: Record<string, unknown> = {};
  if (data.active !== undefined) updates.active = data.active;
  updates.updatedAt = new Date();

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(knowledgeChannels)
    .set(updates)
    .where(eq(knowledgeChannels.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Re-fetch with sync state
  const [channel] = await db
    .select({
      id: knowledgeChannels.id,
      accountId: knowledgeChannels.accountId,
      slackChannelId: knowledgeChannels.slackChannelId,
      slackChannelName: knowledgeChannels.slackChannelName,
      channelType: knowledgeChannels.channelType,
      channelCategory: knowledgeChannels.channelCategory,
      active: knowledgeChannels.active,
      createdAt: knowledgeChannels.createdAt,
      lastMessageTs: knowledgeSyncState.lastMessageTs,
      lastSyncedAt: knowledgeSyncState.lastSyncedAt,
      lastSyncError: knowledgeSyncState.lastSyncError,
      messagesIngested: knowledgeSyncState.messagesIngested,
    })
    .from(knowledgeChannels)
    .leftJoin(knowledgeSyncState, eq(knowledgeSyncState.channelId, knowledgeChannels.id))
    .where(eq(knowledgeChannels.id, id))
    .limit(1);

  return NextResponse.json({ channel });
}
