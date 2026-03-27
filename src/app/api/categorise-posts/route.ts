import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { postCategoriserTask } from "@/trigger/linkedin-post-categoriser";

export async function POST() {
  try {
    const handle = await tasks.trigger<typeof postCategoriserTask>("post-categoriser", {});
    return NextResponse.json({ triggered: true, runId: handle.id });
  } catch (err) {
    console.error("[categorise-posts] Failed to trigger:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
