import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, users, contacts, accountActions, linkedinProfiles, twitterProfiles } from "@/lib/schema";
import { eq, ilike, and, ne, sql, desc, asc } from "drizzle-orm";
import { findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { uniqueSlug } from "@/lib/account-utils";
import { parseBody } from "@/lib/api-schemas/common";
import { createAccountBodySchema } from "@/lib/api-schemas/accounts";
import { addLinkedinProfile, getAccountCompanyLinkedinUrl } from "@/lib/linkedin-profiles";
import { addTwitterProfile, getAccountCompanyTwitterUrl } from "@/lib/twitter-profiles";

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
      linkedinUrl: sql<
        string | null
      >`(select linkedin_url from ${linkedinProfiles} where ${linkedinProfiles.accountId} = ${accounts.id} and ${linkedinProfiles.sourceType} = 'company' and ${linkedinProfiles.active} = true limit 1)`.as(
        "linkedin_url"
      ),
      twitterUrl: sql<
        string | null
      >`(select twitter_url from ${twitterProfiles} where ${twitterProfiles.accountId} = ${accounts.id} and ${twitterProfiles.sourceType} = 'company' and ${twitterProfiles.active} = true limit 1)`.as(
        "twitter_url"
      ),
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

  return NextResponse.json({ accounts: results });
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
      googleDriveFolderId,
      contentVoiceGuidance: null,
    })
    .returning();

  // Create a linkedin_profile if a LinkedIn URL was provided
  let linkedinUrl: string | null = null;
  if (data.linkedinUrl) {
    try {
      const profile = await addLinkedinProfile(account.id, data.linkedinUrl, {
        displayName: account.name,
        sourceType: "company",
      });
      linkedinUrl = profile.linkedinUrl;
    } catch {
      // skip invalid URLs silently
    }
  }

  // Create a twitter_profile if a Twitter URL was provided
  let twitterUrl: string | null = null;
  if (data.twitterUrl) {
    try {
      const profile = await addTwitterProfile(account.id, data.twitterUrl, {
        displayName: account.name,
        sourceType: "company",
      });
      twitterUrl = profile.twitterUrl;
    } catch {
      // skip invalid URLs silently
    }
  }

  return NextResponse.json({ account: { ...account, linkedinUrl, twitterUrl } }, { status: 201 });
}
