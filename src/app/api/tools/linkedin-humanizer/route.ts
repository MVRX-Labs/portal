import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk/v3";
import type { linkedinHumanizerTask } from "@/trigger/linkedin-humanizer";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: { postContent?: string; tone?: string; writingExamples?: string; model?: string; accountId?: string };
  try {
    inputs = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!inputs.postContent) {
    return NextResponse.json(
      { error: "postContent is required" },
      { status: 400 }
    );
  }

  const accountId = typeof inputs.accountId === "string" ? inputs.accountId : null;

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-humanizer",
      status: "running",
      inputs,
      userId,
      accountId,
    })
    .returning();

  console.log(`[linkedin-humanizer:route][${run.id}] Run created (tone: ${inputs.tone || "none"}, user: ${userName})`);

  try {
    const handle = await tasks.trigger<typeof linkedinHumanizerTask>(
      "linkedin-humanizer",
      {
        runId: run.id,
        postContent: inputs.postContent,
        tone: inputs.tone || "professional",
        writingExamples: inputs.writingExamples,
        model: inputs.model,
      }
    );

    console.log(`[linkedin-humanizer:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

    return NextResponse.json({ id: run.id, status: "running" });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(`[linkedin-humanizer:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json(
      { id: run.id, error: errorMessage },
      { status: 500 }
    );
  }
}
