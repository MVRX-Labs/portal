import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts, linkedinProfiles } from "@/lib/schema";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createContactBodySchema } from "@/lib/api-schemas/contacts";
import { addLinkedinProfile } from "@/lib/linkedin-profiles";

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

  // Populate linkedinUrl from linkedin_profiles
  const contactIds = rows.map((c) => c.id);
  const profiles =
    contactIds.length > 0
      ? await db
          .select({ contactId: linkedinProfiles.contactId, linkedinUrl: linkedinProfiles.linkedinUrl })
          .from(linkedinProfiles)
          .where(and(eq(linkedinProfiles.active, true), inArray(linkedinProfiles.contactId, contactIds)))
      : [];
  const urlByContactId = new Map(profiles.map((p) => [p.contactId, p.linkedinUrl]));

  const results = rows.map((c) => ({
    ...c,
    linkedinUrl: urlByContactId.get(c.id) ?? null,
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
    } catch {
      // skip invalid URLs silently
    }
  }

  return NextResponse.json({ contact: { ...contact, linkedinUrl } }, { status: 201 });
}
