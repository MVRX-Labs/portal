import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts, contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";
import { scrapeLinkedInProfile } from "@/lib/linkedin-audit";
import { withTimeoutGuard } from "@/lib/timeout-guard";

export const maxDuration = 300;

function log(runId: string, message: string) {
  console.log(`[linkedin-audit:route][${runId}] ${message}`);
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: { contactId?: string; accountId?: string | null; model?: string };
  try {
    inputs = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!inputs.contactId) {
    return NextResponse.json(
      { error: "A contact is required" },
      { status: 400 }
    );
  }

  // Resolve contact data
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, inputs.contactId));

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.linkedinUrl) {
    return NextResponse.json(
      { error: "Selected contact has no LinkedIn URL" },
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

  const linkedinUrl = contact.linkedinUrl;

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-audit",
      status: "running",
      inputs: { ...inputs, linkedinUrl, companyName, contactName: contact.name },
      userId,
      accountId: inputs.accountId || null,
    })
    .returning();

  log(run.id, `Run created for "${linkedinUrl}" (contact: ${contact.name}, account: ${companyName}, user: ${userName})`);

  try {
    await withTimeoutGuard(
      async (signal) => {
        log(run.id, "Starting LinkedIn scrape via Apify...");
        const scrapeStart = Date.now();

        const scrapedData = await scrapeLinkedInProfile(
          linkedinUrl,
          signal
        );

        const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
        log(run.id, `Scrape finished in ${scrapeElapsed}s — sending to local-api for Claude processing...`);

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

        const jobRes = await fetch(`${ngrokBase}/api/jobs/linkedin-audit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            runId: run.id,
            slug: scrapedData.slug,
            profileData: scrapedData.profileData,
            postsData: scrapedData.postsData,
            accountName: inputs.accountId ? companyName : undefined,
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
        routeName: "linkedin-audit",
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
