import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { withTimeoutGuard } from "@/lib/timeout-guard";
import { parseBody } from "@/lib/api-schemas/common";

export function createToolHandler<T extends Record<string, unknown>>(toolId: string, schema?: ZodType<T>) {
  return async function POST(request: NextRequest) {
    const userId = request.headers.get("x-user-id");
    const userName = request.headers.get("x-user-name") || "Unknown";

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let inputs: Record<string, unknown>;

    if (schema) {
      const { data, error } = await parseBody(request, schema);
      if (error) return error;
      inputs = data as Record<string, unknown>;
    } else {
      try {
        inputs = await request.json();
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }

    const accountId = typeof inputs.accountId === "string" ? inputs.accountId : null;

    try {
      const [run] = await withTimeoutGuard(
        async () => {
          return db
            .insert(toolRuns)
            .values({
              tool: toolId,
              status: "pending",
              inputs,
              userId,
              accountId,
            })
            .returning();
        },
        {
          maxDuration: 300,
          routeName: toolId,
          userName,
        }
      );

      return NextResponse.json({
        id: run.id,
        status: run.status,
        message: `${toolId} job started`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      try {
        const [failedRun] = await db
          .insert(toolRuns)
          .values({
            tool: toolId,
            status: "failed",
            inputs,
            error: errorMessage,
            userId,
            accountId,
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

      return NextResponse.json({ error: "Failed to start tool run" }, { status: 500 });
    }
  };
}
