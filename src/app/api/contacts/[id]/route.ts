import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contacts,
  leads,
  leadCsvs,
  calendarEventContacts,
  linkedinProfiles,
  twitterProfiles,
  knowledgeUnits,
  secrets,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { updateContactBodySchema } from "@/lib/api-schemas/contacts";
import { addLinkedinProfile, getContactLinkedinUrl } from "@/lib/linkedin-profiles";
import { addTwitterProfile, getContactTwitterUrl } from "@/lib/twitter-profiles";

export const maxDuration = 300;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseBody(request, updateContactBodySchema);
  if (error) return error;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.accountEmail !== undefined) updates.accountEmail = data.accountEmail;
  if (data.personalEmail !== undefined) updates.personalEmail = data.personalEmail;
  if (data.contentVoiceGuidance !== undefined) updates.contentVoiceGuidance = data.contentVoiceGuidance;
  if (data.notes !== undefined) updates.notes = data.notes;
  const [contact] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Handle linkedinUrl → linkedin_profiles
  if (data.linkedinUrl !== undefined && data.linkedinUrl) {
    await addLinkedinProfile(contact.accountId, data.linkedinUrl, {
      displayName: contact.name,
      sourceType: "personal",
      contactId: contact.id,
    }).catch(() => {});
  }

  // Handle twitterUrl → twitter_profiles
  if (data.twitterUrl !== undefined && data.twitterUrl) {
    await addTwitterProfile(contact.accountId, data.twitterUrl, {
      displayName: contact.name,
      sourceType: "personal",
      contactId: contact.id,
    }).catch(() => {});
  }

  const linkedinUrl = await getContactLinkedinUrl(contact.id);
  const twitterUrl = await getContactTwitterUrl(contact.id);
  return NextResponse.json({ contact: { ...contact, linkedinUrl, twitterUrl } });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Verify contact exists
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Clean up foreign key references before deleting
  await db.delete(calendarEventContacts).where(eq(calendarEventContacts.contactId, id));
  await db.update(leads).set({ contactId: null }).where(eq(leads.contactId, id));
  await db.update(leadCsvs).set({ contactId: null }).where(eq(leadCsvs.contactId, id));
  await db.update(linkedinProfiles).set({ contactId: null }).where(eq(linkedinProfiles.contactId, id));
  await db.update(twitterProfiles).set({ contactId: null }).where(eq(twitterProfiles.contactId, id));
  await db.update(knowledgeUnits).set({ assigneeContactId: null }).where(eq(knowledgeUnits.assigneeContactId, id));
  await db.update(secrets).set({ contactId: null }).where(eq(secrets.contactId, id));

  await db.delete(contacts).where(eq(contacts.id, id));

  return NextResponse.json({ success: true });
}
