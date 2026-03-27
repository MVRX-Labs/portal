import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, contacts } from "@/lib/schema";
import { eq, and, desc, ilike, or, sql, isNotNull, isNull } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const q = searchParams.get("q") || "";
  const contactId = searchParams.get("contactId") || null;
  const source = searchParams.get("source") || null; // "twitter" | "linkedin"

  const offset = (page - 1) * limit;

  const conditions = [eq(leads.accountId, accountId)];

  if (source === "twitter") {
    conditions.push(isNotNull(leads.twitterUrl));
  } else if (source === "linkedin") {
    conditions.push(isNotNull(leads.linkedinUrl));
  }

  if (contactId) {
    conditions.push(eq(leads.contactId, contactId));
  }

  if (q) {
    conditions.push(
      or(
        ilike(leads.firstName, `%${q}%`),
        ilike(leads.lastName, `%${q}%`),
        ilike(leads.headline, `%${q}%`),
        ilike(leads.company, `%${q}%`)
      )!
    );
  }

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        linkedinUrl: leads.linkedinUrl,
        twitterUrl: leads.twitterUrl,
        twitterHandle: leads.twitterHandle,
        headline: leads.headline,
        company: leads.company,
        title: leads.title,
        division: leads.division,
        region: leads.region,
        email: leads.email,
        phone: leads.phone,
        profileImageUrl: leads.profileImageUrl,
        engagementTypes: leads.engagementTypes,
        tier: leads.tier,
        conversionPct: leads.conversionPct,
        rationale: leads.rationale,
        contactId: leads.contactId,
        firstSeenAt: leads.firstSeenAt,
        lastSeenAt: leads.lastSeenAt,
      })
      .from(leads)
      .where(where)
      .orderBy(desc(leads.lastSeenAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(where),
  ]);

  // Fetch contact names for display
  const contactIds = [...new Set(rows.filter((r) => r.contactId).map((r) => r.contactId!))];
  const contactMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const contactRows = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(or(...contactIds.map((cid) => eq(contacts.id, cid)))!);
    for (const c of contactRows) {
      contactMap.set(c.id, c.name);
    }
  }

  const leadsWithContact = rows.map((row) => ({
    ...row,
    contactName: row.contactId ? contactMap.get(row.contactId) || null : null,
  }));

  const total = Number(countResult[0]?.count || 0);

  return NextResponse.json({
    leads: leadsWithContact,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
