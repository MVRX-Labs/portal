import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { and, eq, ilike } from "drizzle-orm";

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
  const body = await request.json();
  const { name, accountId, accountEmail, personalEmail, linkedinUrl, engagementScrapeEnabled } = body;

  if (!name || !accountId) {
    return NextResponse.json({ error: "Name and accountId are required" }, { status: 400 });
  }

  const [contact] = await db
    .insert(contacts)
    .values({
      name,
      accountId,
      accountEmail: accountEmail || null,
      personalEmail: personalEmail || null,
      linkedinUrl: linkedinUrl || null,
      engagementScrapeEnabled: engagementScrapeEnabled || false,
    })
    .returning();

  return NextResponse.json({ contact }, { status: 201 });
}
