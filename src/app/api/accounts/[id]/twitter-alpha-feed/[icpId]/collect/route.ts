import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { twitterAlphaFeeds } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { twitterAlphaFeedCollectWorker } from "@/trigger/twitter-alpha-feed";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { icpId } = await params;

  // Find the twitter alpha feed row for this ICP
  const [feed] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (!feed) {
    return NextResponse.json({ error: "No Twitter alpha feed configured for this ICP" }, { status: 404 });
  }

  try {
    const handle = await tasks.trigger<typeof twitterAlphaFeedCollectWorker>("twitter-alpha-feed-collect-worker", {
      twitterAlphaFeedId: feed.id,
    });

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "15m",
    });

    return NextResponse.json({ triggerRunId: handle.id, publicAccessToken });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger collection" },
      { status: 500 }
    );
  }
}
