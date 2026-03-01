import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isObjectId } from "@/lib/ids";

export const maxDuration = 300;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const column = isObjectId(id, "acct") ? accounts.id : accounts.slug;
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(column, id));

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, industry, website } = body;

  const column = isObjectId(id, "acct") ? accounts.id : accounts.slug;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (industry !== undefined) updates.industry = industry;
  if (website !== undefined) updates.website = website;

  const [account] = await db
    .update(accounts)
    .set(updates)
    .where(eq(column, id))
    .returning();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
