import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
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

  const results = await db.select().from(contacts).where(eq(contacts.accountId, accountId)).orderBy(contacts.name);

  return NextResponse.json({ contacts: results });
}
