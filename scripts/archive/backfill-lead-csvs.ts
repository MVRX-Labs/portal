/**
 * Throw-away one-time script to backfill lead_csvs for existing leads that were created
 * before CSV tracking was added. Creates one CSV per account for all leads
 * with leadCsvId = null.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { leads, leadCsvs, accounts } from "../../src/lib/schema";
import { eq, isNull, desc, inArray } from "drizzle-orm";
import { escapeCsv } from "../../src/lib/csv";

config({ path: ".env.local" });

const client = postgres(process.env.STORAGE_DATABASE_URL!);
const db = drizzle(client);

async function backfill() {
  // Find all accounts that have leads without a CSV
  const unlinkedLeads = await db
    .select({
      id: leads.id,
      accountId: leads.accountId,
      firstName: leads.firstName,
      lastName: leads.lastName,
      linkedinUrl: leads.linkedinUrl,
      headline: leads.headline,
      company: leads.company,
      engagementPosts: leads.engagementPosts,
    })
    .from(leads)
    .where(isNull(leads.leadCsvId))
    .orderBy(desc(leads.lastSeenAt));

  if (unlinkedLeads.length === 0) {
    console.log("No unlinked leads found — nothing to backfill.");
    await client.end();
    return;
  }

  // Group by account
  const byAccount = new Map<string, typeof unlinkedLeads>();
  for (const lead of unlinkedLeads) {
    const group = byAccount.get(lead.accountId) || [];
    group.push(lead);
    byAccount.set(lead.accountId, group);
  }

  // Fetch account names
  const accountIds = [...byAccount.keys()];
  const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const accountNameMap = new Map(accountRows.map((a) => [a.id, a.name]));

  console.log(`Found ${unlinkedLeads.length} unlinked leads across ${byAccount.size} account(s)\n`);

  for (const [accountId, accountLeads] of byAccount) {
    const accountName = accountNameMap.get(accountId) || accountId;

    // Build CSV
    const csvHeaders = ["firstName", "lastName", "LinkedInProfileUrl", "headline", "company"];
    const csvRows = [csvHeaders.join(",")];
    for (const lead of accountLeads) {
      csvRows.push(
        [
          escapeCsv(lead.firstName),
          escapeCsv(lead.lastName || ""),
          escapeCsv(lead.linkedinUrl),
          escapeCsv(lead.headline || ""),
          escapeCsv(lead.company || ""),
        ].join(",")
      );
    }
    const csvContent = csvRows.join("\n");
    const filename = `new-leads-${accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

    // Collect post URLs
    const allPostUrls = [...new Set(accountLeads.flatMap((l) => (l.engagementPosts as string[]) || []))];

    // Insert CSV record
    const [csvRecord] = await db
      .insert(leadCsvs)
      .values({
        accountId,
        scrapeWindow: "late",
        description:
          "Historical leads discovered before CSV tracking was enabled. " +
          "Contains all leads that were not previously included in a CSV report.",
        filename,
        csvContent,
        leadCount: accountLeads.length,
        postUrls: allPostUrls,
      })
      .returning({ id: leadCsvs.id });

    // Link leads to this CSV
    const leadIds = accountLeads.map((l) => l.id);
    // Batch in chunks of 500 to avoid query size limits
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      await db.update(leads).set({ leadCsvId: csvRecord.id }).where(inArray(leads.id, chunk));
    }

    console.log(`  ${accountName}: ${accountLeads.length} leads → ${csvRecord.id}`);
  }

  console.log("\nBackfill complete.");
  await client.end();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
