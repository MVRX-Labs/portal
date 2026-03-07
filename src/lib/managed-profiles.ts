import { db } from "@/lib/db";
import { managedProfiles } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

function normalizeManagedLinkedinUrl(linkedinUrl: string): string {
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

export function extractManagedLinkedinSlug(linkedinUrl: string): string | null {
  try {
    const parsed = new URL(linkedinUrl);
    const match = parsed.pathname.match(/^\/(?:in|company)\/([^/?#]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    const match = linkedinUrl.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

function isManagedLinkedinProfileUrl(linkedinUrl: string): boolean {
  return /^https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^/?#]+\/?$/i.test(linkedinUrl);
}

export async function addManagedProfile(
  accountId: string,
  linkedinUrl: string,
  displayName: string,
  linkedinSlug?: string,
) {
  const normalizedLinkedinUrl = normalizeManagedLinkedinUrl(linkedinUrl);
  if (!normalizedLinkedinUrl || !isManagedLinkedinProfileUrl(normalizedLinkedinUrl)) {
    throw new Error("LinkedIn URL must be a valid profile/company URL (linkedin.com/in/... or linkedin.com/company/...)");
  }

  const normalizedSlug =
    linkedinSlug?.trim().toLowerCase() || extractManagedLinkedinSlug(normalizedLinkedinUrl) || undefined;

  const [existing] = await db
    .select()
    .from(managedProfiles)
    .where(and(eq(managedProfiles.accountId, accountId), eq(managedProfiles.linkedinUrl, normalizedLinkedinUrl)));

  if (existing) {
    const [updated] = await db
      .update(managedProfiles)
      .set({
        displayName: displayName.trim() || existing.displayName,
        linkedinSlug: normalizedSlug || existing.linkedinSlug,
        updatedAt: new Date(),
      })
      .where(eq(managedProfiles.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [profile] = await db
    .insert(managedProfiles)
    .values({
      accountId,
      linkedinUrl: normalizedLinkedinUrl,
      displayName: displayName.trim(),
      linkedinSlug: normalizedSlug,
    })
    .returning();
  return profile;
}

export async function listManagedProfiles(accountId: string) {
  return db
    .select()
    .from(managedProfiles)
    .where(and(eq(managedProfiles.accountId, accountId), eq(managedProfiles.active, true)))
    .orderBy(managedProfiles.displayName);
}

export async function getManagedProfile(profileId: string) {
  const [profile] = await db
    .select()
    .from(managedProfiles)
    .where(eq(managedProfiles.id, profileId));
  return profile ?? null;
}
