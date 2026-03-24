/**
 * Knowledge Hub — Channel Management API
 *
 * POST: Register a Slack channel for knowledge ingestion
 * GET: List registered channels with sync status
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeChannels, knowledgeSyncState, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { fetchChannelInfo } from "@/lib/knowledge/slack-client";
import { parseBody } from "@/lib/api-schemas/common";
import { registerChannelBodySchema } from "@/lib/api-schemas/knowledge";

export async function POST(req: NextRequest) {
  const { data, error } = await parseBody(req, registerChannelBodySchema);
  if (error) return error;

  const { accountId, slackChannelId, channelType, channelCategory } = data;
  const category = channelCategory ?? "client_shared";

  // Verify account exists (if provided)
  if (accountId) {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
  }

  // Fetch channel info from Slack
  let channelInfo;
  try {
    channelInfo = await fetchChannelInfo(slackChannelId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch Slack channel: ${msg}` }, { status: 400 });
  }

  // Insert channel
  const [channel] = await db
    .insert(knowledgeChannels)
    .values({
      accountId: accountId ?? null,
      slackChannelId,
      slackChannelName: channelInfo.name,
      channelType: channelType ?? (channelInfo.isShared ? "shared" : "internal"),
      channelCategory: category,
      workspaceId: channelInfo.connectedTeamIds[0] ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!channel) {
    // Already exists — return existing
    const [existing] = await db
      .select()
      .from(knowledgeChannels)
      .where(eq(knowledgeChannels.slackChannelId, slackChannelId))
      .limit(1);
    return NextResponse.json({ channel: existing, created: false });
  }

  // Create sync state
  await db.insert(knowledgeSyncState).values({ channelId: channel.id }).onConflictDoNothing();

  return NextResponse.json({ channel, created: true }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const channels = await db
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
    .leftJoin(knowledgeSyncState, eq(knowledgeSyncState.channelId, knowledgeChannels.id));

  return NextResponse.json({ channels });
}
