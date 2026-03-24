import { NextRequest, NextResponse } from "next/server";
import { tasks, auth } from "@trigger.dev/sdk/v3";

export async function POST(request: NextRequest) {
  try {
    // Trigger the scheduled task manually - pass a minimal payload
    const handle = await tasks.trigger("calendar-sync", {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
    });

    return NextResponse.json({
      triggerRunId: handle.id,
      publicAccessToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
