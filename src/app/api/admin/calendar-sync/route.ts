import { NextRequest, NextResponse } from "next/server";
import { tasks, auth } from "@trigger.dev/sdk/v3";

export async function POST(request: NextRequest) {
  const isAdmin = request.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

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
