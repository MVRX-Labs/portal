import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeChannels, knowledgeSyncState } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  const channels = await db
    .select({
      id: knowledgeChannels.id,
      slackChannelName: knowledgeChannels.slackChannelName,
      channelCategory: knowledgeChannels.channelCategory,
      active: knowledgeChannels.active,
      lastSyncedAt: knowledgeSyncState.lastSyncedAt,
      messagesIngested: knowledgeSyncState.messagesIngested,
    })
    .from(knowledgeChannels)
    .leftJoin(knowledgeSyncState, eq(knowledgeSyncState.channelId, knowledgeChannels.id))
    .where(eq(knowledgeChannels.accountId, accountId));

  return NextResponse.json({ channels });
}
