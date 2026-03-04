import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { accounts, contacts, toolRuns } from "@/lib/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import type { linkedinEngagementScrapeTask } from "@/trigger/linkedin-engagement-scrape";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const userId = request.headers.get("x-user-id");
  const body = await request.json().catch(() => ({}));
  const { contactId, daysBack } = body as { contactId?: string; daysBack?: number };
  // Always use daysBack from UI; default to 1 day when missing so we never fall back to 25h
  const days = daysBack != null && Number(daysBack) > 0 ? Number(daysBack) : 1;
  const hoursBack = days * 24;

  // Collect scrape targets
  type ScrapeItem = {
    payload: {
      accountId: string;
      contactId: string | null;
      linkedinUrl: string;
      sourceType: "company" | "personal";
      runId: string;
      hoursBack: number;
    };
  };

  const items: ScrapeItem[] = [];

  if (contactId) {
    // Scrape a specific contact
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));

    if (!contact?.linkedinUrl) {
      return NextResponse.json({ error: "Contact not found or has no LinkedIn URL" }, { status: 400 });
    }

    const [run] = await db
      .insert(toolRuns)
      .values({
        tool: "linkedin-engagement-scrape",
        status: "running",
        inputs: {
          accountId,
          contactId: contact.id,
          linkedinUrl: contact.linkedinUrl,
          sourceType: "personal",
          daysBack: days,
        },
        userId,
        accountId,
      })
      .returning();

    items.push({
      payload: {
        accountId,
        contactId: contact.id,
        linkedinUrl: contact.linkedinUrl,
        sourceType: "personal",
        runId: run.id,
        hoursBack,
      },
    });
  } else {
    // Scrape all opted-in sources for this account
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Account company page
    if (account.linkedinUrl) {
      const [run] = await db
        .insert(toolRuns)
        .values({
          tool: "linkedin-engagement-scrape",
          status: "running",
          inputs: {
            accountId,
            linkedinUrl: account.linkedinUrl,
            sourceType: "company",
            daysBack: days,
          },
          userId,
          accountId,
        })
        .returning();

      items.push({
        payload: {
          accountId,
          contactId: null,
          linkedinUrl: account.linkedinUrl,
          sourceType: "company",
          runId: run.id,
          hoursBack,
        },
      });
    }

    // All contacts with LinkedIn URLs (opted-in or not — for manual runs we scrape all that have a URL)
    const accountContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.accountId, accountId), isNotNull(contacts.linkedinUrl)));

    // Normalize URLs for dedup (strip trailing slash)
    const accountUrlNorm = account.linkedinUrl?.replace(/\/$/, "") ?? "";

    for (const c of accountContacts) {
      const contactUrlNorm = (c.linkedinUrl ?? "").replace(/\/$/, "");
      if (accountUrlNorm && contactUrlNorm === accountUrlNorm) {
        continue; // Skip contact — same LinkedIn URL as account (already scraped above)
      }
      const [run] = await db
        .insert(toolRuns)
        .values({
          tool: "linkedin-engagement-scrape",
          status: "running",
          inputs: {
            accountId,
            contactId: c.id,
            linkedinUrl: c.linkedinUrl,
            sourceType: "personal",
            daysBack: days,
          },
          userId,
          accountId,
        })
        .returning();

      items.push({
        payload: {
          accountId,
          contactId: c.id,
          linkedinUrl: c.linkedinUrl!,
          sourceType: "personal",
          runId: run.id,
          hoursBack,
        },
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json(
      {
        error: "No sources to scrape. Add a LinkedIn URL to the account or its contacts first.",
      },
      { status: 400 }
    );
  }

  const batchResult = await tasks.batchTrigger<typeof linkedinEngagementScrapeTask>(
    "linkedin-engagement-scrape",
    items
  );

  return NextResponse.json({
    triggered: items.length,
    batchId: batchResult.batchId,
    sources: items.map((i) => ({
      linkedinUrl: i.payload.linkedinUrl,
      sourceType: i.payload.sourceType,
      runId: i.payload.runId,
    })),
  });
}
