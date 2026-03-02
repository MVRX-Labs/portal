import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk/v3";
import type { gtmStrategyTask } from "@/trigger/gtm-strategy";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: {
    accountId?: string | null;
    industry?: string;
    targetAudience?: string;
    productDescription?: string;
    model?: string;
  };
  try {
    inputs = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!inputs.industry || !inputs.targetAudience || !inputs.productDescription) {
    return NextResponse.json(
      { error: "industry, targetAudience, and productDescription are required" },
      { status: 400 },
    );
  }

  let companyName = "Unknown";
  if (inputs.accountId) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, inputs.accountId));
    if (account) companyName = account.name;
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "gtm-strategy",
      status: "running",
      inputs: { ...inputs, companyName },
      userId,
      accountId: inputs.accountId || null,
    })
    .returning();

  console.log(`[gtm-strategy:route][${run.id}] Run created for "${companyName}" (user: ${userName})`);

  try {
    const handle = await tasks.trigger<typeof gtmStrategyTask>(
      "gtm-strategy-generation",
      {
        runId: run.id,
        companyName,
        accountName: inputs.accountId ? companyName : undefined,
        industry: inputs.industry,
        targetAudience: inputs.targetAudience,
        productDescription: inputs.productDescription,
        model: inputs.model,
      }
    );

    console.log(`[gtm-strategy:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

    return NextResponse.json({ id: run.id, status: "running" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(`[gtm-strategy:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json(
      { id: run.id, error: errorMessage },
      { status: 500 },
    );
  }
}
