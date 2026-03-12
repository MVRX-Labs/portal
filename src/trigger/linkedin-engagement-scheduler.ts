import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { accounts, contacts, toolRuns, engagementProfiles } from "@/lib/schema";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { linkedinEngagementScrapeTask } from "./linkedin-engagement-scrape";
import { outboundEngagementScrapeTask } from "./outbound-engagement-scrape";

export const linkedinEngagementScheduler = schedules.task({
  id: "linkedin-engagement-scheduler",
  cron: "0 */2 * * *", // Every 2 hours — triggers early (~6h) and late (~72h) analysis windows
  run: async () => {
    logger.info("Starting LinkedIn engagement scheduler");

    // --- Inbound engagement ---
    // For each source we trigger two scrapes per run:
    //   early window (5–9h old posts)  → captures engagement ~6-7h after posting
    //   late window  (68–76h old posts) → captures engagement ~72h after posting
    // The 2h cron interval with these window widths ensures every post gets analysed
    // in both windows. Overlap is safe because lead upserts are idempotent.

    const WINDOWS = [
      { hoursBackMin: 5, hoursBack: 9, scrapeWindow: "early" as const },
      { hoursBackMin: 68, hoursBack: 76, scrapeWindow: "late" as const },
    ];

    // Collect opted-in accounts with a LinkedIn company page
    const optedInAccounts = await db
      .select({
        id: accounts.id,
        linkedinUrl: accounts.linkedinUrl,
      })
      .from(accounts)
      .where(and(eq(accounts.engagementScrapeEnabled, true), isNotNull(accounts.linkedinUrl)));

    // Collect opted-in contacts with a LinkedIn profile URL
    const optedInContacts = await db
      .select({
        id: contacts.id,
        accountId: contacts.accountId,
        linkedinUrl: contacts.linkedinUrl,
      })
      .from(contacts)
      .where(and(eq(contacts.engagementScrapeEnabled, true), isNotNull(contacts.linkedinUrl)));

    logger.info(`Found ${optedInAccounts.length} accounts and ${optedInContacts.length} contacts to scrape`);

    type ScrapePayload = {
      payload: {
        accountId: string;
        contactId: string | null;
        linkedinUrl: string;
        sourceType: "company" | "personal";
        runId: string;
        hoursBack: number;
        hoursBackMin: number;
        scrapeWindow: "early" | "late";
      };
    };

    const items: ScrapePayload[] = [];

    for (const acct of optedInAccounts) {
      for (const window of WINDOWS) {
        const [run] = await db
          .insert(toolRuns)
          .values({
            tool: "linkedin-engagement-scrape",
            status: "running",
            inputs: {
              accountId: acct.id,
              linkedinUrl: acct.linkedinUrl,
              sourceType: "company",
              scrapeWindow: window.scrapeWindow,
            },
            userId: null,
            accountId: acct.id,
          })
          .returning();

        items.push({
          payload: {
            accountId: acct.id,
            contactId: null,
            linkedinUrl: acct.linkedinUrl!,
            sourceType: "company",
            runId: run.id,
            hoursBack: window.hoursBack,
            hoursBackMin: window.hoursBackMin,
            scrapeWindow: window.scrapeWindow,
          },
        });
      }
    }

    for (const contact of optedInContacts) {
      for (const window of WINDOWS) {
        const [run] = await db
          .insert(toolRuns)
          .values({
            tool: "linkedin-engagement-scrape",
            status: "running",
            inputs: {
              accountId: contact.accountId,
              contactId: contact.id,
              linkedinUrl: contact.linkedinUrl,
              sourceType: "personal",
              scrapeWindow: window.scrapeWindow,
            },
            userId: null,
            accountId: contact.accountId,
          })
          .returning();

        items.push({
          payload: {
            accountId: contact.accountId,
            contactId: contact.id,
            linkedinUrl: contact.linkedinUrl!,
            sourceType: "personal",
            runId: run.id,
            hoursBack: window.hoursBack,
            hoursBackMin: window.hoursBackMin,
            scrapeWindow: window.scrapeWindow,
          },
        });
      }
    }

    if (items.length > 0) {
      await linkedinEngagementScrapeTask.batchTrigger(items);
      const earlyCount = items.filter((i) => i.payload.scrapeWindow === "early").length;
      const lateCount = items.filter((i) => i.payload.scrapeWindow === "late").length;
      logger.info(
        `Batch triggered ${items.length} inbound scrape tasks (${earlyCount} early, ${lateCount} late) ` +
          `for ${optedInAccounts.length} accounts and ${optedInContacts.length} contacts`
      );
    }

    // --- Outbound engagement ---

    const engagementAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(isNotNull(accounts.engagementSlackChannel), ne(accounts.engagementSlackChannel, "")));

    let outboundCount = 0;
    for (const acct of engagementAccounts) {
      const profiles = await db.select().from(engagementProfiles).where(eq(engagementProfiles.accountId, acct.id));

      if (profiles.length === 0) continue;

      await outboundEngagementScrapeTask.batchTrigger(
        profiles.map((p) => ({
          payload: { accountId: acct.id, profileId: p.id, maxPosts: 10 },
        }))
      );
      outboundCount += profiles.length;
    }

    if (outboundCount > 0) {
      logger.info(`Batch triggered ${outboundCount} outbound engagement scrape tasks`);
    }

    return {
      accountSources: optedInAccounts.length,
      contactSources: optedInContacts.length,
      inboundTasks: items.length,
      outboundProfiles: outboundCount,
    };
  },
});
