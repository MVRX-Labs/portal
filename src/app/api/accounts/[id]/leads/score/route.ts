import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { icpDefinitions, toolRuns } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import type { leadScoringBatchTask } from "@/trigger/lead-scoring";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  // Validate account has active ICP definitions
  const activeIcps = await db
    .select({ id: icpDefinitions.id })
    .from(icpDefinitions)
    .where(and(eq(icpDefinitions.accountId, accountId), eq(icpDefinitions.active, true)));

  if (activeIcps.length === 0) {
    return NextResponse.json(
      { error: "No active ICP definitions found. Create an ICP definition first." },
      { status: 400 }
    );
  }

  // Create a tool run record for tracking
  const [toolRun] = await db
    .insert(toolRuns)
    .values({
      tool: "lead-scoring-batch",
      status: "running",
      inputs: { accountId },
      accountId,
    })
    .returning({ id: toolRuns.id });

  // Trigger the scoring task
  const handle = await tasks.trigger<typeof leadScoringBatchTask>("lead-scoring-batch", {
    accountId,
  });

  // Update tool run with trigger run ID
  await db
    .update(toolRuns)
    .set({ triggerRunId: handle.id, updatedAt: new Date() })
    .where(eq(toolRuns.id, toolRun.id));

  return NextResponse.json({
    runId: toolRun.id,
    triggerRunId: handle.id,
    icpCount: activeIcps.length,
  });
}
