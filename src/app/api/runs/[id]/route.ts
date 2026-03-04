import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { auth } from "@trigger.dev/sdk/v3";

export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [run] = await db
    .select({
      id: toolRuns.id,
      tool: toolRuns.tool,
      status: toolRuns.status,
      output: toolRuns.output,
      outputUrl: toolRuns.outputUrl,
      error: toolRuns.error,
      triggerRunId: toolRuns.triggerRunId,
      createdAt: toolRuns.createdAt,
      updatedAt: toolRuns.updatedAt,
    })
    .from(toolRuns)
    .where(eq(toolRuns.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const isActive = run.status === "running" || run.status === "pending";

  if (isActive && run.triggerRunId) {
    try {
      const publicAccessToken = await auth.createPublicToken({
        scopes: { read: { runs: [run.triggerRunId] } },
        expirationTime: "1h",
      });
      return NextResponse.json({ ...run, publicAccessToken });
    } catch {
      return NextResponse.json(run);
    }
  }

  return NextResponse.json(run);
}
