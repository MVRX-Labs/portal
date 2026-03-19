/**
 * One-time migration to populate linkedin_profiles from existing account/contact
 * LinkedIn URLs. Creates profiles with all flags (analytics, outbound, inbound) set
 * to false. Safe to run multiple times — uses ON CONFLICT to preserve existing profiles.
 *
 * Usage:
 *   STORAGE_DATABASE_URL=$PROD npx tsx scripts/migrate-linkedin-urls-to-profiles.ts
 */
import { config } from "dotenv";
import postgres from "postgres";
import { createId } from "@paralleldrive/cuid2";

config({ path: ".env.local" });

const sql = postgres(process.env.STORAGE_DATABASE_URL!);

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

function extractSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(?:in|company)\/([^/?#]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function migrate() {
  console.log("Migrating LinkedIn URLs to linkedin_profiles...\n");

  // Accounts with LinkedIn URLs → company profiles
  const accounts = await sql`
    SELECT id, name, linkedin_url
    FROM accounts
    WHERE linkedin_url IS NOT NULL AND linkedin_url != ''
  `;

  let accountCount = 0;
  for (const acct of accounts) {
    const url = normalizeLinkedinUrl(acct.linkedin_url);
    if (!url) continue;

    const id = `lprof_${createId()}`;
    const slug = extractSlug(url);

    await sql`
      INSERT INTO linkedin_profiles (id, account_id, linkedin_url, linkedin_slug, display_name, source_type, analytics_enabled, outbound_enabled, inbound_enabled, engagement_persona, active, created_at, updated_at)
      VALUES (${id}, ${acct.id}, ${url}, ${slug}, ${acct.name}, 'company', false, false, false, '', true, now(), now())
      ON CONFLICT (account_id, linkedin_url)
      DO UPDATE SET
        display_name = COALESCE(NULLIF(linkedin_profiles.display_name, ''), ${acct.name}),
        source_type = COALESCE(linkedin_profiles.source_type, 'company'),
        updated_at = now()
    `;
    accountCount++;
  }

  console.log(`  Accounts: ${accountCount} company profiles upserted`);

  // Contacts with LinkedIn URLs → personal profiles
  const contacts = await sql`
    SELECT c.id, c.name, c.linkedin_url, c.account_id
    FROM contacts c
    WHERE c.linkedin_url IS NOT NULL AND c.linkedin_url != ''
  `;

  let contactCount = 0;
  for (const contact of contacts) {
    const url = normalizeLinkedinUrl(contact.linkedin_url);
    if (!url) continue;

    const id = `lprof_${createId()}`;
    const slug = extractSlug(url);

    await sql`
      INSERT INTO linkedin_profiles (id, account_id, linkedin_url, linkedin_slug, display_name, source_type, contact_id, analytics_enabled, outbound_enabled, inbound_enabled, engagement_persona, active, created_at, updated_at)
      VALUES (${id}, ${contact.account_id}, ${url}, ${slug}, ${contact.name}, 'personal', ${contact.id}, false, false, false, '', true, now(), now())
      ON CONFLICT (account_id, linkedin_url)
      DO UPDATE SET
        display_name = COALESCE(NULLIF(linkedin_profiles.display_name, ''), ${contact.name}),
        source_type = COALESCE(linkedin_profiles.source_type, 'personal'),
        contact_id = COALESCE(linkedin_profiles.contact_id, ${contact.id}),
        updated_at = now()
    `;
    contactCount++;
  }

  console.log(`  Contacts: ${contactCount} personal profiles upserted`);
  console.log(`\nDone. Total: ${accountCount + contactCount} profiles processed.`);

  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
