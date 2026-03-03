import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { systemTestTask } from "@/trigger/system-test";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: { model?: string; accountId?: string | null } = {};
  try {
    inputs = await request.json();
  } catch {
    // no body is fine for system-test
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "system-test",
      status: "running",
      inputs,
      userId,
      accountId: inputs.accountId || null,
    })
    .returning();

  console.log(`[system-test:route][${run.id}] Run created (user: ${userName})`);

  try {
    const handle = await tasks.trigger<typeof systemTestTask>(
      "system-test",
      {
        runId: run.id,
        model: inputs.model,
      }
    );

    console.log(`[system-test:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

    await db
      .update(toolRuns)
      .set({ triggerRunId: handle.id })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
    });

    return NextResponse.json({ id: run.id, status: "running", triggerRunId: handle.id, publicAccessToken });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(`[system-test:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json(
      { id: run.id, error: errorMessage },
      { status: 500 }
    );
  }
}
