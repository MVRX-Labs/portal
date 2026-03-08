import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { updateContactBodySchema } from "@/lib/api-schemas/contacts";

export const maxDuration = 300;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseBody(request, updateContactBodySchema);
  if (error) return error;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.accountEmail !== undefined) updates.accountEmail = data.accountEmail;
  if (data.personalEmail !== undefined) updates.personalEmail = data.personalEmail;
  if (data.linkedinUrl !== undefined) updates.linkedinUrl = data.linkedinUrl;
  if (data.engagementScrapeEnabled !== undefined) updates.engagementScrapeEnabled = data.engagementScrapeEnabled;

  const [contact] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ contact });
}
