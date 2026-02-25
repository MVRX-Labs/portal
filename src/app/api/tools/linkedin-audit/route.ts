import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";
import { runLinkedInAudit } from "@/lib/linkedin-audit";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: { linkedinUrl?: string };
  try {
    inputs = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!inputs.linkedinUrl) {
    return NextResponse.json(
      { error: "linkedinUrl is required" },
      { status: 400 }
    );
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-audit",
      status: "running",
      inputs,
      userId,
    })
    .returning();

  try {
    const output = await runLinkedInAudit(inputs.linkedinUrl);

    await db
      .update(toolRuns)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id));

    return NextResponse.json({
      id: run.id,
      status: "completed",
      output,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    await sendSlackNotification({
      tool: "linkedin-audit",
      userName,
      error: errorMessage,
      runId: run.id,
    }).catch(() => {});

    return NextResponse.json(
      { id: run.id, error: errorMessage },
      { status: 500 }
    );
  }
}
