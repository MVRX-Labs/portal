import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { seoAuditTask } from "@/trigger/seo-audit";
import { parseBody } from "@/lib/api-schemas/common";
import { seoAuditBodySchema } from "@/lib/api-schemas/tools";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, seoAuditBodySchema);
  if (error) return error;

  const [account] = await db.select().from(accounts).where(eq(accounts.id, inputs.accountId));
  const accountName = account?.name;
  if (!accountName) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const includeCwv = inputs.includeCwv === true || inputs.includeCwv === "true";

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "seo-audit",
      status: "running",
      inputs: { ...inputs, accountName },
      userId,
      accountId: inputs.accountId,
    })
    .returning();

  console.log(
    `[seo-audit:route][${run.id}] Run created for "${inputs.websiteUrl}" (crawl: ${inputs.crawlMode}, user: ${userName})`
  );

  try {
    const handle = await tasks.trigger<typeof seoAuditTask>("seo-audit-generation", {
      runId: run.id,
      websiteUrl: inputs.websiteUrl,
      crawlMode: inputs.crawlMode,
      categories: inputs.categories || undefined,
      includeCwv,
      accountName,
      model: inputs.model,
    });

    console.log(`[seo-audit:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

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

    console.log(`[seo-audit:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
