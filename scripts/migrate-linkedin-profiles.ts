/**
 * One-time migration script: populate linkedin_profiles from existing data.
 *
 * Run with: npx tsx scripts/migrate-linkedin-profiles.ts [--dry-run]
 */

import "dotenv/config";

import { db } from "../src/lib/db";
import { managedProfiles, engagementProfiles, accounts, contacts, linkedinProfiles } from "../src/lib/schema";
import { eq, and } from "drizzle-orm";
import { migrateExistingProfiles } from "../src/lib/linkedin-profiles";

const DRY_RUN = process.argv.includes("--dry-run");

function normalizeLinkedinUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

async function dryRun() {
  console.log("=== DRY RUN — no writes will be performed ===\n");

  const existing = await db.select().from(linkedinProfiles);
  const existingKeys = new Set(existing.map((p) => `${p.accountId}|${p.linkedinUrl}`));

  let fromManaged = 0;
  let fromEngagement = 0;
  let fromAccounts = 0;
  let fromContacts = 0;
  const wouldCreate: string[] = [];
  const wouldUpdate: string[] = [];

  function check(accountId: string, linkedinUrl: string, label: string) {
    const key = `${accountId}|${normalizeLinkedinUrl(linkedinUrl)}`;
    if (existingKeys.has(key)) {
      wouldUpdate.push(`  UPDATE ${label}: ${linkedinUrl} (account ${accountId})`);
    } else {
      wouldCreate.push(`  INSERT ${label}: ${linkedinUrl} (account ${accountId})`);
    }
  }

  const managed = await db.select().from(managedProfiles);
  for (const mp of managed) {
    check(mp.accountId, mp.linkedinUrl, "analytics");
    fromManaged++;
  }

  const engagement = await db.select().from(engagementProfiles);
  for (const ep of engagement) {
    check(ep.accountId, ep.linkedinUrl, "outbound");
    fromEngagement++;
  }

  const accts = await db.select().from(accounts).where(eq(accounts.engagementScrapeEnabled, true));
  for (const acct of accts) {
    if (!acct.linkedinUrl) continue;
    check(acct.id, acct.linkedinUrl, "inbound/company");
    fromAccounts++;
  }

  const ctcts = await db.select().from(contacts).where(eq(contacts.engagementScrapeEnabled, true));
  for (const c of ctcts) {
    if (!c.linkedinUrl) continue;
    check(c.accountId, c.linkedinUrl, "inbound/personal");
    fromContacts++;
  }

  console.log("Sources:");
  console.log(`  managedProfiles (analytics):  ${fromManaged}`);
  console.log(`  engagementProfiles (outbound): ${fromEngagement}`);
  console.log(`  accounts (inbound):            ${fromAccounts}`);
  console.log(`  contacts (inbound):            ${fromContacts}`);
  console.log();

  if (wouldCreate.length) {
    console.log(`Would INSERT ${wouldCreate.length} new profiles:`);
    wouldCreate.forEach((l) => console.log(l));
  } else {
    console.log("No new profiles to insert.");
  }
  console.log();

  if (wouldUpdate.length) {
    console.log(`Would UPDATE ${wouldUpdate.length} existing profiles:`);
    wouldUpdate.forEach((l) => console.log(l));
  } else {
    console.log("No existing profiles to update.");
  }

  console.log("\nDry run complete.");
}

async function main() {
  if (DRY_RUN) {
    await dryRun();
    process.exit(0);
  }

  console.log("Migrating existing profiles to linkedin_profiles...");
  const result = await migrateExistingProfiles();
  console.log("Migration complete:");
  console.log(`  From managedProfiles (analytics): ${result.fromManaged}`);
  console.log(`  From engagementProfiles (outbound): ${result.fromEngagement}`);
  console.log(`  From accounts (inbound): ${result.fromAccounts}`);
  console.log(`  From contacts (inbound): ${result.fromContacts}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
