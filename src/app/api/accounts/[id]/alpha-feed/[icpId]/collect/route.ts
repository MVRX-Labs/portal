import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alphaFeeds } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk/v3";
import type { alphaFeedCollectWorker } from "@/trigger/alpha-feed";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { icpId } = await params;

  // Find the alpha feed row for this ICP
  const [feed] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (!feed) {
    return NextResponse.json({ error: "No alpha feed configured for this ICP" }, { status: 404 });
  }

  try {
    const handle = await tasks.trigger<typeof alphaFeedCollectWorker>("alpha-feed-collect-worker", {
      alphaFeedId: feed.id,
    });
    return NextResponse.json({ triggerRunId: handle.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger collection" },
      { status: 500 }
    );
  }
}
