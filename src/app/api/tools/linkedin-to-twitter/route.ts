import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { linkedinToTwitterTask } from "@/trigger/linkedin-to-twitter";
import { parseBody } from "@/lib/api-schemas/common";
import { linkedinToTwitterBodySchema } from "@/lib/api-schemas/tools";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, linkedinToTwitterBodySchema);
  if (error) return error;

  const accountId = typeof inputs.accountId === "string" ? inputs.accountId : null;

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-to-twitter",
      status: "running",
      inputs,
      userId,
      accountId,
    })
    .returning();

  console.log(`[linkedin-to-twitter:route][${run.id}] Run created (user: ${userName})`);

  try {
    const handle = await tasks.trigger<typeof linkedinToTwitterTask>("linkedin-to-twitter", {
      runId: run.id,
      postContent: inputs.postContent,
      model: inputs.model,
      promptStyle: inputs.promptStyle,
      customPrompt: inputs.customPrompt,
    });

    console.log(`[linkedin-to-twitter:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

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

    console.log(`[linkedin-to-twitter:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
