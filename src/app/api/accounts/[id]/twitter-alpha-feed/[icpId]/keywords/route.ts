import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { twitterAlphaFeeds, type TwitterAlphaFeedKeyword } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import {
  addTwitterAlphaFeedKeywordBodySchema,
  toggleTwitterAlphaFeedKeywordBodySchema,
  removeTwitterAlphaFeedKeywordBodySchema,
} from "@/lib/api-schemas/twitter-alpha-feed";

type Params = { params: Promise<{ id: string; icpId: string }> };

async function ensureRow(accountId: string, icpId: string) {
  const [existing] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (existing) return existing;

  const [created] = await db.insert(twitterAlphaFeeds).values({ accountId, icpDefinitionId: icpId }).returning();
  return created;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: accountId, icpId } = await params;
  const { data, error } = await parseBody(request, addTwitterAlphaFeedKeywordBodySchema);
  if (error) return error;

  const row = await ensureRow(accountId, icpId);
  const keywords: TwitterAlphaFeedKeyword[] = (row.keywords ?? []) as TwitterAlphaFeedKeyword[];

  if (keywords.some((k) => k.query === data.query)) {
    return NextResponse.json({ error: "Keyword already exists" }, { status: 409 });
  }

  keywords.push({ query: data.query, active: true });

  const [updated] = await db
    .update(twitterAlphaFeeds)
    .set({ keywords, updatedAt: new Date() })
    .where(eq(twitterAlphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ twitterAlphaFeed: updated }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, toggleTwitterAlphaFeedKeywordBodySchema);
  if (error) return error;

  const [row] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Twitter alpha feed not found" }, { status: 404 });

  const keywords: TwitterAlphaFeedKeyword[] = (row.keywords ?? []) as TwitterAlphaFeedKeyword[];
  const keyword = keywords.find((k) => k.query === data.query);
  if (!keyword) return NextResponse.json({ error: "Keyword not found" }, { status: 404 });

  keyword.active = data.active;

  const [updated] = await db
    .update(twitterAlphaFeeds)
    .set({ keywords, updatedAt: new Date() })
    .where(eq(twitterAlphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ twitterAlphaFeed: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, removeTwitterAlphaFeedKeywordBodySchema);
  if (error) return error;

  const [row] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Twitter alpha feed not found" }, { status: 404 });

  const keywords: TwitterAlphaFeedKeyword[] = (row.keywords ?? []) as TwitterAlphaFeedKeyword[];
  const filtered = keywords.filter((k) => k.query !== data.query);

  const [updated] = await db
    .update(twitterAlphaFeeds)
    .set({ keywords: filtered, updatedAt: new Date() })
    .where(eq(twitterAlphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ twitterAlphaFeed: updated });
}
