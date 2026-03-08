import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import { TOOLS } from "@/lib/types";
import type { implementSuggestionTask } from "@/trigger/implement-suggestion";
import { parseBody } from "@/lib/api-schemas/common";
import { suggestionBodySchema } from "@/lib/api-schemas/tools";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, suggestionBodySchema);
  if (error) return error;

  const toolExists = TOOLS.some((t) => t.id === inputs.toolId);
  if (!toolExists) {
    return NextResponse.json({ error: `Unknown tool: ${inputs.toolId}` }, { status: 400 });
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "suggestion",
      status: "running",
      inputs: { toolId: inputs.toolId, description: inputs.description },
      userId,
    })
    .returning();

  console.log(`[suggestion:route][${run.id}] Run created (tool: ${inputs.toolId}, user: ${userName})`);

  try {
    const handle = await tasks.trigger<typeof implementSuggestionTask>("implement-suggestion", {
      runId: run.id,
      toolId: inputs.toolId,
      description: inputs.description,
      userName,
    });

    console.log(`[suggestion:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

    await db
      .update(toolRuns)
      .set({ triggerRunId: handle.id })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "2h",
    });

    return NextResponse.json({
      id: run.id,
      status: "running",
      triggerRunId: handle.id,
      publicAccessToken,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(`[suggestion:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
