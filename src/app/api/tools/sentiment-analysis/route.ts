import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";
import { scrapeSentimentSources, type SourceType } from "@/lib/sentiment-scraper";
import { withTimeoutGuard } from "@/lib/timeout-guard";

export const maxDuration = 300;

function log(runId: string, message: string) {
  console.log(`[sentiment-analysis:route][${runId}] ${message}`);
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: {
    productName?: string;
    accountId?: string | null;
    sources?: string;
    urls?: string;
    keywords?: string;
    model?: string;
  };
  try {
    inputs = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!inputs.productName) {
    return NextResponse.json(
      { error: "productName is required" },
      { status: 400 }
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

  log(run.id, `Run created for "${inputs.productName}" (${companyName}) — source: ${sourceType}, user: ${userName}`);

  try {
    await withTimeoutGuard(
      async (signal) => {
        log(run.id, "Starting sentiment scrape via Apify...");
        const scrapeStart = Date.now();

        const scrapedData = await scrapeSentimentSources(
          inputs.productName!,
          companyName,
          sourceType,
          additionalUrls,
          signal
        );

        const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
        log(run.id, `Scrape finished in ${scrapeElapsed}s (${scrapedData.sources.length} sources) — sending to local-api...`);

        const ngrokBase = process.env.NGROK_BASE_URL;
        const apiKey = process.env.DANNY_LOCAL_API_KEY;

        if (!ngrokBase || !apiKey) {
          throw new Error("Missing NGROK_BASE_URL or DANNY_LOCAL_API_KEY");
        }

        const forwardedHost = request.headers.get("x-forwarded-host");
        const forwardedProto =
          request.headers.get("x-forwarded-proto") || "https";
        const appUrl = forwardedHost
          ? `${forwardedProto}://${forwardedHost}`
          : request.nextUrl.origin;

        const callbackUrl = `${appUrl}/api/hooks/job-complete`;

        const jobRes = await fetch(`${ngrokBase}/api/jobs/sentiment-analysis`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            runId: run.id,
            productName: inputs.productName,
            companyName,
            accountName: inputs.accountId ? companyName : undefined,
            scrapedSources: scrapedData.sources,
            keywords,
            model: inputs.model,
            callbackUrl,
          }),
          signal,
        });

        if (!jobRes.ok) {
          const body = await jobRes.text();
          throw new Error(
            `Failed to start background job (${jobRes.status}): ${body.slice(0, 500)}`
          );
        }

        log(run.id, "Local-api accepted the job (202) — Claude processing in background");
      },
      {
        maxDuration: 300,
        routeName: "sentiment-analysis",
        runId: run.id,
        userName,
      }
    );

    return NextResponse.json({ id: run.id, status: "running" });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    log(run.id, `Failed: ${errorMessage}`);

    await sendSlackNotification({
      tool: "sentiment-analysis",
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
