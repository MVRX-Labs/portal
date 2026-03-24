import { NextRequest, NextResponse } from "next/server";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { alphaFeedGenerateSpecTask } from "@/trigger/alpha-feed";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { id: accountId, icpId } = await params;

  try {
    const handle = await tasks.trigger<typeof alphaFeedGenerateSpecTask>("alpha-feed-generate-spec", {
      accountId,
      icpDefinitionId: icpId,
    });

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "15m",
    });

    return NextResponse.json({ triggerRunId: handle.id, publicAccessToken });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger spec generation" },
      { status: 500 }
    );
  }
}
