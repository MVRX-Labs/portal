import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { sentimentAnalysisTask } from "@/trigger/sentiment-analysis";
import type { SourceType } from "@/lib/sentiment-scraper";
import { parseBody } from "@/lib/api-schemas/common";
import { sentimentAnalysisBodySchema } from "@/lib/api-schemas/tools";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, sentimentAnalysisBodySchema);
  if (error) return error;

  let companyName = "Unknown";
  if (inputs.accountId) {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, inputs.accountId));
    if (account) companyName = account.name;
  }

  const sourceType = (inputs.sources || "all") as SourceType;
  const additionalUrls = (inputs.urls || "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const keywords = inputs.keywords || "";

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "sentiment-analysis",
      status: "running",
      inputs: { ...inputs, companyName },
      userId,
      accountId: inputs.accountId || null,
    })
    .returning();

  console.log(
    `[sentiment-analysis:route][${run.id}] Run created for "${inputs.productName}" (${companyName}) — source: ${sourceType}, user: ${userName}`
  );

  try {
    const handle = await tasks.trigger<typeof sentimentAnalysisTask>("sentiment-analysis-generation", {
      runId: run.id,
      productName: inputs.productName,
      companyName,
      accountName: inputs.accountId ? companyName : undefined,
      sources: sourceType,
      additionalUrls,
      keywords,
      model: inputs.model,
    });

    console.log(`[sentiment-analysis:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

    await db
      .update(toolRuns)
      .set({ triggerRunId: handle.id })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
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

    console.log(`[sentiment-analysis:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
