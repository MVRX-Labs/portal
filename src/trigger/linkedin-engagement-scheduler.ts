import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { accounts, contacts, toolRuns } from "@/lib/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { linkedinEngagementScrapeTask } from "./linkedin-engagement-scrape";

export const linkedinEngagementScheduler = schedules.task({
  id: "linkedin-engagement-scheduler",
  cron: "0 5 * * *", // 5 AM UTC daily
  run: async () => {
    logger.info("Starting LinkedIn engagement scheduler");

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

    if (optedInAccounts.length === 0 && optedInContacts.length === 0) {
      logger.info("No sources to scrape, exiting");
      return { accountSources: 0, contactSources: 0 };
    }

    // Build payloads for batch trigger, creating toolRuns records for each
    type ScrapePayload = {
      payload: {
        accountId: string;
        contactId: string | null;
        linkedinUrl: string;
        sourceType: "company" | "personal";
        runId: string;
      };
    };

    const items: ScrapePayload[] = [];

    for (const acct of optedInAccounts) {
      const [run] = await db
        .insert(toolRuns)
        .values({
          tool: "linkedin-engagement-scrape",
          status: "running",
          inputs: { accountId: acct.id, linkedinUrl: acct.linkedinUrl, sourceType: "company" },
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
        },
      });
    }

    for (const contact of optedInContacts) {
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
        },
      });
    }

    await linkedinEngagementScrapeTask.batchTrigger(items);

    logger.info(
      `Batch triggered ${items.length} scrape tasks (${optedInAccounts.length} accounts, ${optedInContacts.length} contacts)`
    );

    return {
      accountSources: optedInAccounts.length,
      contactSources: optedInContacts.length,
    };
  },
});
