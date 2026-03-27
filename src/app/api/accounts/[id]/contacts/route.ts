import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, contacts, linkedinProfiles, twitterProfiles } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isObjectId } from "@/lib/ids";

export const maxDuration = 300;

async function resolveAccountId(idOrSlug: string): Promise<string | null> {
  if (isObjectId(idOrSlug, "acct")) return idOrSlug;
  const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.slug, idOrSlug)).limit(1);
  return row?.id ?? null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accountId = await resolveAccountId(id);
  if (!accountId) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const rows = await db.select().from(contacts).where(eq(contacts.accountId, accountId)).orderBy(contacts.name);

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
