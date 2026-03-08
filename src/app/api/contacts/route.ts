import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { and, eq, ilike } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createContactBodySchema } from "@/lib/api-schemas/contacts";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const q = searchParams.get("q");

  const conditions = [];
  if (accountId) conditions.push(eq(contacts.accountId, accountId));
  if (q) conditions.push(ilike(contacts.name, `%${q}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.select().from(contacts).where(where).orderBy(contacts.name);

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
      linkedinUrl: data.linkedinUrl || null,
      engagementScrapeEnabled: data.engagementScrapeEnabled || false,
    })
    .returning();

  return NextResponse.json({ contact }, { status: 201 });
}
