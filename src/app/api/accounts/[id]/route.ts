import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isObjectId } from "@/lib/ids";
import { findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { parseBody } from "@/lib/api-schemas/common";
import { updateAccountBodySchema } from "@/lib/api-schemas/accounts";

export const maxDuration = 300;

async function ensureDriveFolder(account: typeof accounts.$inferSelect) {
  if (account.googleDriveFolderId) return account;

  try {
    const rootFolderId = getGeneratedMaterialsFolderId();
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
  try {
    const { id } = await params;

    const column = isObjectId(id, "acct") ? accounts.id : accounts.slug;
    let [account] = await db.select().from(accounts).where(eq(column, id));

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    account = await ensureDriveFolder(account);

    return NextResponse.json({ account });
  } catch (err) {
    console.error("GET /api/accounts/[id] failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseBody(request, updateAccountBodySchema);
  if (error) return error;

  const column = isObjectId(id, "acct") ? accounts.id : accounts.slug;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.industry !== undefined) updates.industry = data.industry;
  if (data.website !== undefined) updates.website = data.website;
  if (data.linkedinUrl !== undefined) updates.linkedinUrl = data.linkedinUrl;
  if (data.engagementScrapeEnabled !== undefined) updates.engagementScrapeEnabled = data.engagementScrapeEnabled;
  if (data.summary !== undefined) updates.summary = data.summary;
  if (data.contentVoiceGuidance !== undefined) updates.contentVoiceGuidance = data.contentVoiceGuidance;
  if (data.ownerId !== undefined) updates.ownerId = data.ownerId || null;
  if (data.mrr !== undefined) updates.mrr = data.mrr;
  if (data.mrrCurrency !== undefined) updates.mrrCurrency = data.mrrCurrency;
  if (data.hidden !== undefined) updates.hidden = data.hidden;
  if (data.engagementSlackChannel !== undefined) updates.engagementSlackChannel = data.engagementSlackChannel;

  const [account] = await db.update(accounts).set(updates).where(eq(column, id)).returning();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
