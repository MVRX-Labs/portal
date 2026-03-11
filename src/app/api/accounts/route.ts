import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, users, contacts, accountActions } from "@/lib/schema";
import { eq, ilike, and, ne, sql, desc, asc } from "drizzle-orm";
import { findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { uniqueSlug } from "@/lib/account-utils";
import { parseBody } from "@/lib/api-schemas/common";
import { createAccountBodySchema } from "@/lib/api-schemas/accounts";
import { computeAccountHealthScores } from "@/lib/account-health";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const includeHidden = searchParams.get("includeHidden") === "true";
  const sort = searchParams.get("sort");

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
      notes: accounts.notes,
      contentVoiceGuidance: accounts.contentVoiceGuidance,
      ownerId: accounts.ownerId,
      ownerName: users.name,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
      lastMeetingAt: accounts.lastMeetingAt,
      nextMeetingAt: accounts.nextMeetingAt,
      engagementSlackChannel: accounts.engagementSlackChannel,
      analyticsSlackChannel: accounts.analyticsSlackChannel,
      autoCreated: accounts.autoCreated,
      hidden: accounts.hidden,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      contactCount:
        sql<number>`(select count(*)::int from ${contacts} where ${contacts.accountId} = ${accounts.id})`.as(
          "contact_count"
        ),
      pendingActionCount:
        sql<number>`(select count(*)::int from ${accountActions} where ${accountActions.accountId} = ${accounts.id} and ${accountActions.status} != 'completed')`.as(
          "pending_action_count"
        ),
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(accounts.mrr), sql`${accounts.lastMeetingAt} asc nulls last`);

  // Compute health scores and merge into results
  const accountIds = results.map((r) => r.id);
  const healthScores = await computeAccountHealthScores(accountIds);

  const enriched = results.map((r) => {
    const health = healthScores[r.id];
    return {
      ...r,
      healthScore: health?.score ?? 0,
      healthLabel: health?.label ?? "Unknown",
      healthBreakdown: health?.breakdown ?? { meeting: 0, content: 0, actions: 0, setup: 0 },
    };
  });

  // Sort by health score if requested
  if (sort === "health") {
    enriched.sort((a, b) => a.healthScore - b.healthScore);
  } else if (sort === "health-desc") {
    enriched.sort((a, b) => b.healthScore - a.healthScore);
  }

  return NextResponse.json({ accounts: enriched });
}

export async function POST(request: NextRequest) {
  const { data, error } = await parseBody(request, createAccountBodySchema);
  if (error) return error;

  const slug = await uniqueSlug(data.name);

  let googleDriveFolderId: string | null = null;
  try {
    const rootFolderId = getGeneratedMaterialsFolderId();
    googleDriveFolderId = await findOrCreateFolder(data.name, rootFolderId);
  } catch (err) {
    console.error("Failed to create Google Drive folder:", err);
  }

  const [account] = await db
    .insert(accounts)
    .values({
      name: data.name,
      slug,
      industry: data.industry || null,
      website: data.website || null,
      linkedinUrl: data.linkedinUrl || null,
      engagementScrapeEnabled: data.engagementScrapeEnabled || false,
      googleDriveFolderId,
      contentVoiceGuidance: null,
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
}
