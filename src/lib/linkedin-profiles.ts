import { db } from "@/lib/db";
import { linkedinProfiles, accounts, contacts, managedProfiles, engagementProfiles } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

function normalizeLinkedinUrl(linkedinUrl: string): string {
  const trimmed = linkedinUrl.trim();
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

export function extractLinkedinSlug(linkedinUrl: string): string | null {
  try {
    const parsed = new URL(linkedinUrl);
    const match = parsed.pathname.match(/^\/(?:in|company)\/([^/?#]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    const match = linkedinUrl.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

function isValidLinkedinUrl(linkedinUrl: string): boolean {
  return /^https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^/?#]+\/?$/i.test(linkedinUrl);
}

export async function addLinkedinProfile(
  accountId: string,
  linkedinUrl: string,
  options?: {
    displayName?: string;
    linkedinSlug?: string;
    analyticsEnabled?: boolean;
    outboundEnabled?: boolean;
    inboundEnabled?: boolean;
    engagementPersona?: string;
    sourceType?: string;
    contactId?: string;
  }
) {
  const normalizedUrl = normalizeLinkedinUrl(linkedinUrl);
  if (!normalizedUrl || !isValidLinkedinUrl(normalizedUrl)) {
    throw new Error(
      "LinkedIn URL must be a valid profile/company URL (linkedin.com/in/... or linkedin.com/company/...)"
    );
  }

  const slug = options?.linkedinSlug?.trim().toLowerCase() || extractLinkedinSlug(normalizedUrl) || undefined;

  const [existing] = await db
    .select()
    .from(linkedinProfiles)
    .where(and(eq(linkedinProfiles.accountId, accountId), eq(linkedinProfiles.linkedinUrl, normalizedUrl)));

  if (existing) {
    const [updated] = await db
      .update(linkedinProfiles)
      .set({
        displayName: options?.displayName?.trim() || existing.displayName,
        linkedinSlug: slug || existing.linkedinSlug,
        analyticsEnabled: options?.analyticsEnabled ?? existing.analyticsEnabled,
        outboundEnabled: options?.outboundEnabled ?? existing.outboundEnabled,
        inboundEnabled: options?.inboundEnabled ?? existing.inboundEnabled,
        engagementPersona: options?.engagementPersona ?? existing.engagementPersona,
        sourceType: options?.sourceType ?? existing.sourceType,
        contactId: options?.contactId ?? existing.contactId,
        updatedAt: new Date(),
      })
      .where(eq(linkedinProfiles.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [profile] = await db
    .insert(linkedinProfiles)
    .values({
      accountId,
      linkedinUrl: normalizedUrl,
      displayName: options?.displayName?.trim() || "",
      linkedinSlug: slug,
      analyticsEnabled: options?.analyticsEnabled ?? false,
      outboundEnabled: options?.outboundEnabled ?? false,
      inboundEnabled: options?.inboundEnabled ?? false,
      engagementPersona: options?.engagementPersona ?? "",
      sourceType: options?.sourceType,
      contactId: options?.contactId,
    })
    .returning();
  return profile;
}

export async function listLinkedinProfiles(
  accountId: string,
  filters?: { analyticsEnabled?: boolean; outboundEnabled?: boolean; inboundEnabled?: boolean }
) {
  const conditions = [eq(linkedinProfiles.accountId, accountId), eq(linkedinProfiles.active, true)];
  if (filters?.analyticsEnabled === true) conditions.push(eq(linkedinProfiles.analyticsEnabled, true));
  if (filters?.outboundEnabled === true) conditions.push(eq(linkedinProfiles.outboundEnabled, true));
  if (filters?.inboundEnabled === true) conditions.push(eq(linkedinProfiles.inboundEnabled, true));
  return db
    .select()
    .from(linkedinProfiles)
    .where(and(...conditions))
    .orderBy(linkedinProfiles.displayName);
}

export async function getLinkedinProfile(profileId: string) {
  const [profile] = await db.select().from(linkedinProfiles).where(eq(linkedinProfiles.id, profileId));
  return profile ?? null;
}

/**
 * Migrate existing data from managedProfiles, engagementProfiles,
 * and accounts/contacts with engagementScrapeEnabled into the unified
 * linkedin_profiles table. Safe to run multiple times (upserts by accountId+linkedinUrl).
 */
export async function migrateExistingProfiles(): Promise<{
  fromManaged: number;
  fromEngagement: number;
  fromAccounts: number;
  fromContacts: number;
}> {
  let fromManaged = 0;
  let fromEngagement = 0;
  let fromAccounts = 0;
  let fromContacts = 0;

  // 1. Migrate managedProfiles → analyticsEnabled
  const managed = await db.select().from(managedProfiles);
  for (const mp of managed) {
    await addLinkedinProfile(mp.accountId, mp.linkedinUrl, {
      displayName: mp.displayName,
      linkedinSlug: mp.linkedinSlug ?? undefined,
      analyticsEnabled: true,
    });
    fromManaged++;
  }

  // 2. Migrate engagementProfiles → outboundEnabled
  const engagement = await db.select().from(engagementProfiles);
  for (const ep of engagement) {
    await addLinkedinProfile(ep.accountId, ep.linkedinUrl, {
      displayName: ep.displayName,
      outboundEnabled: true,
      engagementPersona: ep.engagementPersona,
    });
    fromEngagement++;
  }

  // 3. Migrate accounts with engagementScrapeEnabled → inboundEnabled
  const accts = await db.select().from(accounts).where(eq(accounts.engagementScrapeEnabled, true));
  for (const acct of accts) {
    if (!acct.linkedinUrl) continue;
    await addLinkedinProfile(acct.id, acct.linkedinUrl, {
      displayName: acct.name,
      inboundEnabled: true,
      sourceType: "company",
    });
    fromAccounts++;
  }

  // 4. Migrate contacts with engagementScrapeEnabled → inboundEnabled
  const ctcts = await db.select().from(contacts).where(eq(contacts.engagementScrapeEnabled, true));
  for (const c of ctcts) {
    if (!c.linkedinUrl) continue;
    await addLinkedinProfile(c.accountId, c.linkedinUrl, {
      displayName: c.name,
      inboundEnabled: true,
      sourceType: "personal",
      contactId: c.id,
    });
    fromContacts++;
  }

  return { fromManaged, fromEngagement, fromAccounts, fromContacts };
}
