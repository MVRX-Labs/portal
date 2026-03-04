import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isObjectId } from "@/lib/ids";
import { findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";

export const maxDuration = 300;

async function ensureDriveFolder(account: typeof accounts.$inferSelect) {
  if (account.googleDriveFolderId) return account;

  const rootFolderId = getGeneratedMaterialsFolderId();

  try {
    const folderId = await findOrCreateFolder(account.name, rootFolderId);
    const [updated] = await db
      .update(accounts)
      .set({ googleDriveFolderId: folderId, updatedAt: new Date() })
      .where(eq(accounts.id, account.id))
      .returning();
    return updated;
  } catch (err) {
    console.error(`Failed to backfill Drive folder for account ${account.id}:`, err);
    return account;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const column = isObjectId(id, "acct") ? accounts.id : accounts.slug;
  let [account] = await db.select().from(accounts).where(eq(column, id));

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  account = await ensureDriveFolder(account);

  return NextResponse.json({ account });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { name, industry, website, linkedinUrl, engagementScrapeEnabled, summary, ownerId, mrr, mrrCurrency, hidden } =
    body;

  const column = isObjectId(id, "acct") ? accounts.id : accounts.slug;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (industry !== undefined) updates.industry = industry;
  if (website !== undefined) updates.website = website;
  if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl;
  if (engagementScrapeEnabled !== undefined) updates.engagementScrapeEnabled = engagementScrapeEnabled;
  if (summary !== undefined) updates.summary = summary;
  if (ownerId !== undefined) updates.ownerId = ownerId || null;
  if (mrr !== undefined) updates.mrr = mrr;
  if (mrrCurrency !== undefined) updates.mrrCurrency = mrrCurrency;
  if (hidden !== undefined) updates.hidden = hidden;

  const [account] = await db.update(accounts).set(updates).where(eq(column, id)).returning();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
