import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alphaFeeds, type AlphaFeedKeyword } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import {
  addAlphaFeedKeywordBodySchema,
  toggleAlphaFeedKeywordBodySchema,
  removeAlphaFeedKeywordBodySchema,
} from "@/lib/api-schemas/alpha-feed";

type Params = { params: Promise<{ id: string; icpId: string }> };

async function ensureRow(accountId: string, icpId: string) {
  const [existing] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (existing) return existing;

  const [created] = await db.insert(alphaFeeds).values({ accountId, icpDefinitionId: icpId }).returning();
  return created;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: accountId, icpId } = await params;
  const { data, error } = await parseBody(request, addAlphaFeedKeywordBodySchema);
  if (error) return error;

  const row = await ensureRow(accountId, icpId);
  const keywords: AlphaFeedKeyword[] = (row.keywords ?? []) as AlphaFeedKeyword[];

  if (keywords.some((k) => k.query === data.query)) {
    return NextResponse.json({ error: "Keyword already exists" }, { status: 409 });
  }

  keywords.push({ query: data.query, active: true });

  const [updated] = await db
    .update(alphaFeeds)
    .set({ keywords, updatedAt: new Date() })
    .where(eq(alphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ alphaFeed: updated }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, toggleAlphaFeedKeywordBodySchema);
  if (error) return error;

  const [row] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Alpha feed not found" }, { status: 404 });

  const keywords: AlphaFeedKeyword[] = (row.keywords ?? []) as AlphaFeedKeyword[];
  const keyword = keywords.find((k) => k.query === data.query);
  if (!keyword) return NextResponse.json({ error: "Keyword not found" }, { status: 404 });

  keyword.active = data.active;

  const [updated] = await db
    .update(alphaFeeds)
    .set({ keywords, updatedAt: new Date() })
    .where(eq(alphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ alphaFeed: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, removeAlphaFeedKeywordBodySchema);
  if (error) return error;

  const [row] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Alpha feed not found" }, { status: 404 });

  const keywords: AlphaFeedKeyword[] = (row.keywords ?? []) as AlphaFeedKeyword[];
  const filtered = keywords.filter((k) => k.query !== data.query);

  const [updated] = await db
    .update(alphaFeeds)
    .set({ keywords: filtered, updatedAt: new Date() })
    .where(eq(alphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ alphaFeed: updated });
}
