import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { alphaFeedGenerateSpecTask } from "@/trigger/alpha-feed";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { id: accountId, icpId } = await params;

  try {
    const handle = await tasks.trigger<typeof alphaFeedGenerateSpecTask>("alpha-feed-generate-spec", {
      accountId,
      icpDefinitionId: icpId,
    });
    return NextResponse.json({ triggerRunId: handle.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger spec generation" },
      { status: 500 }
    );
  }
}
