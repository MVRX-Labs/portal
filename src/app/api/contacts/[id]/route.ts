import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 300;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { name, accountEmail, personalEmail, linkedinUrl, engagementScrapeEnabled } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (accountEmail !== undefined) updates.accountEmail = accountEmail;
  if (personalEmail !== undefined) updates.personalEmail = personalEmail;
  if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl;
  if (engagementScrapeEnabled !== undefined) updates.engagementScrapeEnabled = engagementScrapeEnabled;

  const [contact] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ contact });
}
