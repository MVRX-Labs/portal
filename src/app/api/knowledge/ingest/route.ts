/**
 * Knowledge Hub — Manual Ingestion Trigger API
 *
 * POST: Trigger immediate ingestion for a specific channel or all channels.
 */

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { knowledgeSlackIngestChannel } from "@/trigger/knowledge-slack-ingest";

export async function POST(req: NextRequest) {
  const isAdmin = req.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { channelDbId } = body;

  if (channelDbId) {
    // Trigger single channel ingestion via Trigger.dev
    const handle = await tasks.trigger<typeof knowledgeSlackIngestChannel>(
      "knowledge-slack-ingest-channel",
      { channelDbId },
    );

    return NextResponse.json({
      message: `Ingestion triggered for channel ${channelDbId}`,
      runId: handle.id,
    });
  }

  // For all-channels: trigger each individually
  // (scheduled task handles this via cron; manual trigger fans out)
  const { db } = await import("@/lib/db");
  const { knowledgeChannels } = await import("@/lib/schema");
  const { eq } = await import("drizzle-orm");

  const channels = await db
    .select({ id: knowledgeChannels.id, name: knowledgeChannels.slackChannelName })
    .from(knowledgeChannels)
    .where(eq(knowledgeChannels.active, true));

  const handles = [];
  for (const ch of channels) {
    const handle = await tasks.trigger<typeof knowledgeSlackIngestChannel>(
      "knowledge-slack-ingest-channel",
      { channelDbId: ch.id },
    );
    handles.push({ channel: ch.name, runId: handle.id });
  }

  return NextResponse.json({
    message: `Ingestion triggered for ${handles.length} channels`,
    runs: handles,
  });
}
