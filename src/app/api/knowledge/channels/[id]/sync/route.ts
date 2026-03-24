/**
 * Knowledge Hub — Trigger Sync for Specific Channel
 *
 * POST: Triggers ingestion for a single channel.
 */

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { knowledgeSlackIngestChannel } from "@/trigger/knowledge-slack-ingest";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const handle = await tasks.trigger<typeof knowledgeSlackIngestChannel>("knowledge-slack-ingest-channel", {
      channelDbId: id,
    });

    return NextResponse.json({ runId: handle.id });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Sync trigger failed: ${errMsg}` }, { status: 500 });
  }
}
