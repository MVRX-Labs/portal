import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, users, contacts, accountActions } from "@/lib/schema";
import { eq, ilike, and, ne, sql, desc, asc } from "drizzle-orm";
import { findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { uniqueSlug } from "@/lib/account-utils";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const includeHidden = searchParams.get("includeHidden") === "true";

  const conditions = [];
  if (q) conditions.push(ilike(accounts.name, `%${q}%`));
  if (!includeHidden) conditions.push(eq(accounts.hidden, false));

  const results = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      slug: accounts.slug,
      industry: accounts.industry,
      website: accounts.website,
      linkedinUrl: accounts.linkedinUrl,
      engagementScrapeEnabled: accounts.engagementScrapeEnabled,
      googleDriveFolderId: accounts.googleDriveFolderId,
      summary: accounts.summary,
      ownerId: accounts.ownerId,
      ownerName: users.name,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
      lastMeetingAt: accounts.lastMeetingAt,
      nextMeetingAt: accounts.nextMeetingAt,
      autoCreated: accounts.autoCreated,
      hidden: accounts.hidden,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      contactCount: sql<number>`(select count(*) from ${contacts} where ${contacts.accountId} = ${accounts.id})`.as(
        "contact_count"
      ),
      pendingActionCount:
        sql<number>`(select count(*) from ${accountActions} where ${accountActions.accountId} = ${accounts.id} and ${accountActions.status} != 'completed')`.as(
          "pending_action_count"
        ),
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(accounts.mrr), sql`${accounts.lastMeetingAt} asc nulls last`);

  return NextResponse.json({ accounts: results });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, industry, website, linkedinUrl, engagementScrapeEnabled } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = await uniqueSlug(name);

  let googleDriveFolderId: string | null = null;
  try {
    const rootFolderId = getGeneratedMaterialsFolderId();
    googleDriveFolderId = await findOrCreateFolder(name, rootFolderId);
  } catch (err) {
    console.error("Failed to create Google Drive folder:", err);
  }

  const [account] = await db
    .insert(accounts)
    .values({
      name,
      slug,
      industry: industry || null,
      website: website || null,
      linkedinUrl: linkedinUrl || null,
      engagementScrapeEnabled: engagementScrapeEnabled || false,
      googleDriveFolderId,
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
}
