import { db } from "./db";
import { accounts, contacts } from "./schema";
import { eq, or, sql } from "drizzle-orm";
import { uniqueSlug } from "./account-utils";

export interface MatchResult {
  accountId: string;
  contactId: string;
  accountMatchConfidence: "high" | "low" | "auto_created";
  accountMatchedVia: string;
  contactMatchConfidence: "high" | "low" | "auto_created";
  contactMatchedVia: string;
  /** Set when a brand-new account was auto-created and needs enrichment */
  newAccountDomain?: string;
}

/** Personal/free email providers — never create accounts for these */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "ymail.com",
  "mail.com",
  "gmx.com",
  "gmx.co.uk",
  "fastmail.com",
  "tutanota.com",
  "hey.com",
]);

export function isPersonalEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1]?.trim();
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

/**
 * Extract the domain from an account website field for comparison.
 * Handles URLs with/without protocol, with/without www.
 */
function extractDomain(website: string): string | null {
  try {
    const trimmed = website.trim();
    const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Given an external attendee email and optional display name,
 * find or create the matching account and contact.
 *
 * Returns null for personal email addresses (gmail, outlook, etc.)
 */
export async function matchOrCreateForAttendee(email: string, displayName?: string): Promise<MatchResult | null> {
  const emailLower = email.toLowerCase().trim();
  const domain = emailLower.split("@")[1];
  const domainBase = domain.replace(/^www\./, "");

  // Skip personal email providers entirely
  if (PERSONAL_EMAIL_DOMAINS.has(domainBase)) {
    return null;
  }

  // Step 1: Try to match contact by email
  const [existingContact] = await db
    .select()
    .from(contacts)
    .where(or(eq(contacts.accountEmail, emailLower), eq(contacts.personalEmail, emailLower)))
    .limit(1);

  if (existingContact) {
    const matchedVia = existingContact.accountEmail === emailLower ? "account_email" : "personal_email";
    return {
      accountId: existingContact.accountId,
      contactId: existingContact.id,
      accountMatchConfidence: "high",
      accountMatchedVia: "contact_email",
      contactMatchConfidence: "high",
      contactMatchedVia: matchedVia,
    };
  }

  // Step 2: Try to match account by website domain or emailDomain
  const allAccounts = await db
    .select({ id: accounts.id, website: accounts.website, emailDomain: accounts.emailDomain })
    .from(accounts);

  const matchedAccount = allAccounts.find((a) => {
    // Check emailDomain first (stable, set during auto-creation)
    if (a.emailDomain && a.emailDomain === domainBase) return true;
    // Fall back to website domain (may have been updated by enrichment)
    if (!a.website) return false;
    const accountDomain = extractDomain(a.website);
    return accountDomain === domainBase;
  });

  if (matchedAccount) {
    const contactName = displayName || emailLower.split("@")[0];
    const [newContact] = await db
      .insert(contacts)
      .values({
        name: contactName,
        accountId: matchedAccount.id,
        accountEmail: emailLower,
        autoCreated: true,
      })
      .returning();

    return {
      accountId: matchedAccount.id,
      contactId: newContact.id,
      accountMatchConfidence: "high",
      accountMatchedVia: "email_domain",
      contactMatchConfidence: "high",
      contactMatchedVia: "auto_created",
    };
  }

  // Step 2.5: Try to match by existing contact's email domain
  // Catches cases where emailDomain is NULL (pre-migration accounts) or the company
  // uses multiple email domains (e.g. LabLabs.io + LabLabs.ai)
  const [contactWithSameDomain] = await db
    .select({ accountId: contacts.accountId })
    .from(contacts)
    .where(
      or(
        sql`${contacts.accountEmail} LIKE ${"%" + "@" + domainBase}`,
        sql`${contacts.personalEmail} LIKE ${"%" + "@" + domainBase}`
      )
    )
    .limit(1);

  if (contactWithSameDomain) {
    const contactName = displayName || emailLower.split("@")[0];
    const [newContact] = await db
      .insert(contacts)
      .values({
        name: contactName,
        accountId: contactWithSameDomain.accountId,
        accountEmail: emailLower,
        autoCreated: true,
      })
      .returning();

    return {
      accountId: contactWithSameDomain.accountId,
      contactId: newContact.id,
      accountMatchConfidence: "high",
      accountMatchedVia: "contact_domain",
      contactMatchConfidence: "high",
      contactMatchedVia: "auto_created",
    };
  }

  // Step 3: No match — create account + contact, flagged as auto-created
  // Use the full domain as the account name (will be refined later)
  const accountName = domainBase.split(".")[0];
  const capitalizedName = accountName.charAt(0).toUpperCase() + accountName.slice(1);
  const slug = await uniqueSlug(capitalizedName);

  const [newAccount] = await db
    .insert(accounts)
    .values({
      name: capitalizedName,
      slug,
      website: domainBase,
      emailDomain: domainBase,
      autoCreated: true,
    })
    .returning();

  const contactName = displayName || emailLower.split("@")[0];
  const [newContact] = await db
    .insert(contacts)
    .values({
      name: contactName,
      accountId: newAccount.id,
      accountEmail: emailLower,
      autoCreated: true,
    })
    .returning();

  return {
    accountId: newAccount.id,
    contactId: newContact.id,
    accountMatchConfidence: "auto_created",
    accountMatchedVia: "auto_created",
    contactMatchConfidence: "auto_created",
    contactMatchedVia: "auto_created",
    newAccountDomain: domainBase,
  };
}
