import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";
import { withTimeoutGuard } from "@/lib/timeout-guard";

export const maxDuration = 300;

function log(runId: string, message: string) {
  console.log(`[gtm-strategy:route][${runId}] ${message}`);
}

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

  // Resolve account name
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

  log(run.id, `Run created for "${companyName}" (user: ${userName})`);

  try {
    await withTimeoutGuard(
      async (signal) => {
        const ngrokBase = process.env.NGROK_BASE_URL;
        const apiKey = process.env.DANNY_LOCAL_API_KEY;

        if (!ngrokBase || !apiKey) {
          throw new Error("Missing NGROK_BASE_URL or DANNY_LOCAL_API_KEY");
        }

        const forwardedHost = request.headers.get("x-forwarded-host");
        const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
        const appUrl = forwardedHost
          ? `${forwardedProto}://${forwardedHost}`
          : request.nextUrl.origin;

        const callbackUrl = `${appUrl}/api/hooks/job-complete`;

        log(run.id, "Dispatching to local-api for Claude processing...");

        const jobRes = await fetch(`${ngrokBase}/api/jobs/gtm-strategy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            runId: run.id,
            companyName,
            industry: inputs.industry,
            targetAudience: inputs.targetAudience,
            productDescription: inputs.productDescription,
            model: inputs.model,
            callbackUrl,
          }),
          signal,
        });

        if (!jobRes.ok) {
          const body = await jobRes.text();
          throw new Error(
            `Failed to start background job (${jobRes.status}): ${body.slice(0, 500)}`,
          );
        }

        log(run.id, "Local-api accepted the job (202) — Claude processing in background");
      },
      {
        maxDuration: 300,
        routeName: "gtm-strategy",
        runId: run.id,
        userName,
      },
    );

    return NextResponse.json({ id: run.id, status: "running" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    log(run.id, `Failed: ${errorMessage}`);

    await sendSlackNotification({
      tool: "gtm-strategy",
      userName,
      error: errorMessage,
      runId: run.id,
    }).catch(() => {});

    return NextResponse.json(
      { id: run.id, error: errorMessage },
      { status: 500 },
    );
  }
}
