/**
 * Knowledge Hub — Manual Ingestion Trigger API
 *
 * POST: Trigger immediate ingestion for a specific channel or all channels.
 */

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { knowledgeSlackIngestChannel } from "@/trigger/knowledge-slack-ingest";
import { parseBodyOptional } from "@/lib/api-schemas/common";
import { triggerIngestBodySchema } from "@/lib/api-schemas/knowledge";

export async function POST(req: NextRequest) {
  try {
    const isAdmin = req.headers.get("x-user-admin") === "true";
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data } = await parseBodyOptional(req, triggerIngestBodySchema);
    const { channelDbId } = data;

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

    // For all-channels: trigger the scheduled task directly.
    // This runs ingest → resolve → normalise once (not per-channel),
    // avoiding redundant LLM costs from parallel normalise-all runs.
    const handle = await tasks.trigger("knowledge-slack-ingest-scheduled", {});

    return NextResponse.json({
      message: "Full ingestion pipeline triggered (all channels → resolve → normalise)",
      runId: handle.id,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Ingestion trigger failed: ${errMsg}` }, { status: 500 });
  }
}
