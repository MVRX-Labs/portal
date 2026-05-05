import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts, linkedinProfiles, twitterProfiles } from "@/lib/schema";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createContactBodySchema } from "@/lib/api-schemas/contacts";
import { addLinkedinProfile } from "@/lib/linkedin-profiles";
import { addTwitterProfile } from "@/lib/twitter-profiles";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const q = searchParams.get("q");

  const conditions = [];
  if (accountId) conditions.push(eq(contacts.accountId, accountId));
  if (q) conditions.push(ilike(contacts.name, `%${q}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select().from(contacts).where(where).orderBy(contacts.name);

  // Populate linkedinUrl and twitterUrl from profile tables
  const contactIds = rows.map((c) => c.id);
  const linkedinUrlByContactId = new Map<string, string>();
  const twitterUrlByContactId = new Map<string, string>();

  if (contactIds.length > 0) {
    const liProfiles = await db
      .select({ contactId: linkedinProfiles.contactId, linkedinUrl: linkedinProfiles.linkedinUrl })
      .from(linkedinProfiles)
      .where(and(eq(linkedinProfiles.active, true), inArray(linkedinProfiles.contactId, contactIds)));
    for (const p of liProfiles) {
      if (p.contactId) linkedinUrlByContactId.set(p.contactId, p.linkedinUrl);
    }

    const twProfiles = await db
      .select({ contactId: twitterProfiles.contactId, twitterUrl: twitterProfiles.twitterUrl })
      .from(twitterProfiles)
      .where(and(eq(twitterProfiles.active, true), inArray(twitterProfiles.contactId, contactIds)));
    for (const p of twProfiles) {
      if (p.contactId) twitterUrlByContactId.set(p.contactId, p.twitterUrl);
    }
  }

  const results = rows.map((c) => ({
    ...c,
    linkedinUrl: linkedinUrlByContactId.get(c.id) ?? null,
    twitterUrl: twitterUrlByContactId.get(c.id) ?? null,
  }));

  return NextResponse.json({ contacts: results });
}

export async function POST(request: NextRequest) {
  const { data, error } = await parseBody(request, createContactBodySchema);
  if (error) return error;

  const [contact] = await db
    .insert(contacts)
    .values({
      name: data.name,
      accountId: data.accountId,
      accountEmail: data.accountEmail || null,
      personalEmail: data.personalEmail || null,
      contentVoiceGuidance: data.contentVoiceGuidance || null,
      notes: data.notes || null,
    })
    .returning();

  // Create a linkedin_profile if a LinkedIn URL was provided
  let linkedinUrl: string | null = null;
  if (data.linkedinUrl) {
    try {
      const profile = await addLinkedinProfile(contact.accountId, data.linkedinUrl, {
        displayName: contact.name,
        sourceType: "personal",
        contactId: contact.id,
      });
      linkedinUrl = profile.linkedinUrl;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid LinkedIn URL" },
        { status: 400 }
      );
    }
  }

  // Create a twitter_profile if a Twitter URL was provided
  let twitterUrl: string | null = null;
  if (data.twitterUrl) {
    try {
      const profile = await addTwitterProfile(contact.accountId, data.twitterUrl, {
        displayName: contact.name,
        sourceType: "personal",
        contactId: contact.id,
      });
      twitterUrl = profile.twitterUrl;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid Twitter URL" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ contact: { ...contact, linkedinUrl, twitterUrl } }, { status: 201 });
}
