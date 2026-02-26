import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "system-test",
      status: "running",
      inputs: {},
      userId,
    })
    .returning();

  console.log(`[system-test][${run.id}] Run created (user: ${userName})`);

  try {
    const ngrokBase = process.env.NGROK_BASE_URL;
    const apiKey = process.env.DANNY_LOCAL_API_KEY;

    if (!ngrokBase || !apiKey) {
      throw new Error("Missing NGROK_BASE_URL or DANNY_LOCAL_API_KEY");
    }

    const callbackUrl = buildCallbackUrl(request);

    const jobRes = await fetch(`${ngrokBase}/api/jobs/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        runId: run.id,
        callbackUrl,
      }),
    });

    if (!jobRes.ok) {
      const body = await jobRes.text();
      throw new Error(
        `Failed to start background job (${jobRes.status}): ${body.slice(0, 500)}`
      );
    }

    console.log(`[system-test][${run.id}] Local-api accepted the job (202)`);

    return NextResponse.json({ id: run.id, status: "running" });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(`[system-test][${run.id}] Failed: ${errorMessage}`);

    await sendSlackNotification({
      tool: "system-test",
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

function buildCallbackUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const appUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : request.nextUrl.origin;
  return `${appUrl}/api/hooks/job-complete`;
}
