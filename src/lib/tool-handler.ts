import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";

export function createToolHandler(toolId: string) {
  return async function POST(request: NextRequest) {
    const userId = request.headers.get("x-user-id");
    const userName = request.headers.get("x-user-name") || "Unknown";

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let inputs: Record<string, unknown>;
    try {
      inputs = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    try {
      const [run] = await db
        .insert(toolRuns)
        .values({
          tool: toolId,
          status: "pending",
          inputs,
          userId,
        })
        .returning();

      // TODO: Integrate with Apify / AI agents / HeyReach / Google Drive
      // For now, return the run ID so the frontend can poll for status

      return NextResponse.json({
        id: run.id,
        status: run.status,
        message: `${toolId} job started`,
      });
    } catch (error) {
      // On failure, attempt to log and notify
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      try {
        const [failedRun] = await db
          .insert(toolRuns)
          .values({
            tool: toolId,
            status: "failed",
            inputs,
            error: errorMessage,
            userId,
          })
          .returning();

        await sendSlackNotification({
          tool: toolId,
          userName,
          error: errorMessage,
          runId: failedRun.id,
        });
      } catch {
        // Best effort logging
      }

      return NextResponse.json(
        { error: "Failed to start tool run" },
        { status: 500 }
      );
    }
  };
}
