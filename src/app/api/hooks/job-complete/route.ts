import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";
import { parseBody } from "@/lib/api-schemas/common";
import { jobCompleteBodySchema } from "@/lib/api-schemas/hooks";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { data: body, error } = await parseBody(request, jobCompleteBodySchema);
  if (error) return error;

  const expectedKey = process.env.DANNY_LOCAL_API_KEY;
  if (!expectedKey || body.apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const durationStr = body.durationMs ? ` (${(body.durationMs / 1000).toFixed(1)}s)` : "";
  console.log(`[linkedin-audit:callback][${body.runId}] Received callback — status: ${body.status}${durationStr}`);

  if (body.status === "completed") {
    await db
      .update(toolRuns)
      .set({
        status: "completed",
        output: body.output || null,
        updatedAt: new Date(),
      })
      .where(eq(toolRuns.id, body.runId));

    console.log(`[linkedin-audit:callback][${body.runId}] Run marked as completed in DB`);
  } else {
    await db
      .update(toolRuns)
      .set({
        status: "failed",
        error: body.error || "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(toolRuns.id, body.runId));

    console.log(`[linkedin-audit:callback][${body.runId}] Run marked as failed in DB: ${body.error}`);

    const [run] = await db
      .select({ userId: toolRuns.userId, tool: toolRuns.tool })
      .from(toolRuns)
      .where(eq(toolRuns.id, body.runId))
      .limit(1);

    if (run) {
      await sendSlackNotification({
        tool: run.tool,
        userName: "background-job",
        error: body.error || "Unknown error",
        runId: body.runId,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
