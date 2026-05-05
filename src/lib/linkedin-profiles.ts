import { db } from "@/lib/db";
import { linkedinProfiles } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

function normalizeLinkedinUrl(linkedinUrl: string): string {
  const trimmed = linkedinUrl.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^(?:[a-z]{2}\.)?(?:www\.)?/, "");
    const pathMatch = parsed.pathname.match(/^\/(in|company)\/([^/?#]+)/i);
    const cleanPath = pathMatch ? `/${pathMatch[1]}/${pathMatch[2]}` : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.hostname}${cleanPath}`;
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
  return /^https?:\/\/(?:[a-z]{2}\.)?(?:www\.)?linkedin\.com\/(?:in|company)\/[^/?#]+/i.test(linkedinUrl);
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

export async function getContactLinkedinUrl(contactId: string): Promise<string | null> {
  const [profile] = await db
    .select({ linkedinUrl: linkedinProfiles.linkedinUrl })
    .from(linkedinProfiles)
    .where(and(eq(linkedinProfiles.contactId, contactId), eq(linkedinProfiles.active, true)))
    .limit(1);
  return profile?.linkedinUrl ?? null;
}

export async function getAccountCompanyLinkedinUrl(accountId: string): Promise<string | null> {
  const [profile] = await db
    .select({ linkedinUrl: linkedinProfiles.linkedinUrl })
    .from(linkedinProfiles)
    .where(
      and(
        eq(linkedinProfiles.accountId, accountId),
        eq(linkedinProfiles.sourceType, "company"),
        eq(linkedinProfiles.active, true)
      )
    )
    .limit(1);
  return profile?.linkedinUrl ?? null;
}
