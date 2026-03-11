import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { growthReportTask } from "@/trigger/growth-report";
import { parseBody } from "@/lib/api-schemas/common";
import { growthReportBodySchema } from "@/lib/api-schemas/tools";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, growthReportBodySchema);
  if (error) return error;

  // Validate account exists and has a website
  const [account] = await db.select().from(accounts).where(eq(accounts.id, inputs.accountId));
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (!account.website) {
    return NextResponse.json({ error: "Account has no website configured" }, { status: 400 });
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "growth-report",
      status: "running",
      inputs: { ...inputs, accountName: account.name, website: account.website },
      userId,
      accountId: inputs.accountId,
    })
    .returning();

  console.log(
    `[growth-report:route][${run.id}] Run created for "${account.name}" (${account.website}, user: ${userName})`
  );

  try {
    const handle = await tasks.trigger<typeof growthReportTask>("growth-report-generation", {
      runId: run.id,
      accountId: inputs.accountId,
      model: inputs.model,
    });

    console.log(`[growth-report:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

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

    console.log(`[growth-report:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
