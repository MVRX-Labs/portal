import { db } from "@/lib/db";
import { twitterProfiles } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

function normalizeTwitterUrl(twitterUrl: string): string {
  const trimmed = twitterUrl.trim();
  if (!trimmed) return "";

  // Handle @handle format
  if (trimmed.startsWith("@")) {
    return `https://x.com/${trimmed.slice(1).toLowerCase()}`;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    parsed.search = "";
    // Normalise twitter.com → x.com
    parsed.hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace("twitter.com", "x.com");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function extractTwitterHandle(twitterUrl: string): string | null {
  // Handle @handle format directly
  if (twitterUrl.startsWith("@")) {
    const handle = twitterUrl.slice(1).trim().toLowerCase();
    return handle || null;
  }

  try {
    const parsed = new URL(twitterUrl);
    // Match /username (first path segment, no nested paths like /settings)
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    const match = twitterUrl.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/?$/i);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

function isValidTwitterUrl(twitterUrl: string): boolean {
  return /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]{1,15}\/?$/i.test(twitterUrl);
}

export async function addTwitterProfile(
  accountId: string,
  twitterUrl: string,
  options?: {
    displayName?: string;
    twitterHandle?: string;
    analyticsEnabled?: boolean;
    outboundEnabled?: boolean;
    inboundEnabled?: boolean;
    engagementPersona?: string;
    sourceType?: string;
    contactId?: string;
  }
) {
  const normalizedUrl = normalizeTwitterUrl(twitterUrl);
  if (!normalizedUrl || !isValidTwitterUrl(normalizedUrl)) {
    throw new Error("Twitter URL must be a valid profile URL (x.com/username or twitter.com/username) or @handle");
  }

  const handle = options?.twitterHandle?.trim().toLowerCase() || extractTwitterHandle(normalizedUrl) || undefined;

  const [existing] = await db
    .select()
    .from(twitterProfiles)
    .where(and(eq(twitterProfiles.accountId, accountId), eq(twitterProfiles.twitterUrl, normalizedUrl)));

  if (existing) {
    const [updated] = await db
      .update(twitterProfiles)
      .set({
        displayName: options?.displayName?.trim() || existing.displayName,
        twitterHandle: handle || existing.twitterHandle,
        analyticsEnabled: options?.analyticsEnabled ?? existing.analyticsEnabled,
        outboundEnabled: options?.outboundEnabled ?? existing.outboundEnabled,
        inboundEnabled: options?.inboundEnabled ?? existing.inboundEnabled,
        engagementPersona: options?.engagementPersona ?? existing.engagementPersona,
        sourceType: options?.sourceType ?? existing.sourceType,
        contactId: options?.contactId ?? existing.contactId,
        updatedAt: new Date(),
      })
      .where(eq(twitterProfiles.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [profile] = await db
    .insert(twitterProfiles)
    .values({
      accountId,
      twitterUrl: normalizedUrl,
      displayName: options?.displayName?.trim() || "",
      twitterHandle: handle,
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

export async function listTwitterProfiles(
  accountId: string,
  filters?: { analyticsEnabled?: boolean; outboundEnabled?: boolean; inboundEnabled?: boolean }
) {
  const conditions = [eq(twitterProfiles.accountId, accountId), eq(twitterProfiles.active, true)];
  if (filters?.analyticsEnabled === true) conditions.push(eq(twitterProfiles.analyticsEnabled, true));
  if (filters?.outboundEnabled === true) conditions.push(eq(twitterProfiles.outboundEnabled, true));
  if (filters?.inboundEnabled === true) conditions.push(eq(twitterProfiles.inboundEnabled, true));
  return db
    .select()
    .from(twitterProfiles)
    .where(and(...conditions))
    .orderBy(twitterProfiles.displayName);
}

export async function getTwitterProfile(profileId: string) {
  const [profile] = await db.select().from(twitterProfiles).where(eq(twitterProfiles.id, profileId));
  return profile ?? null;
}

export async function getAccountCompanyTwitterUrl(accountId: string): Promise<string | null> {
  const [profile] = await db
    .select({ twitterUrl: twitterProfiles.twitterUrl })
    .from(twitterProfiles)
    .where(
      and(
        eq(twitterProfiles.accountId, accountId),
        eq(twitterProfiles.sourceType, "company"),
        eq(twitterProfiles.active, true)
      )
    )
    .limit(1);
  return profile?.twitterUrl ?? null;
}

export async function getContactTwitterUrl(contactId: string): Promise<string | null> {
  const [profile] = await db
    .select({ twitterUrl: twitterProfiles.twitterUrl })
    .from(twitterProfiles)
    .where(and(eq(twitterProfiles.contactId, contactId), eq(twitterProfiles.active, true)))
    .limit(1);
  return profile?.twitterUrl ?? null;
}
