import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { twitterAlphaFeeds, type TwitterAlphaFeedSage } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import {
  addTwitterAlphaFeedSageBodySchema,
  toggleTwitterAlphaFeedSageBodySchema,
  removeTwitterAlphaFeedSageBodySchema,
} from "@/lib/api-schemas/twitter-alpha-feed";
import { extractTwitterHandle } from "@/lib/twitter-profiles";

type Params = { params: Promise<{ id: string; icpId: string }> };

/** Ensure a twitter_alpha_feeds row exists for this ICP, return it. */
async function ensureRow(accountId: string, icpId: string) {
  const [existing] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (existing) return existing;

  const [created] = await db.insert(twitterAlphaFeeds).values({ accountId, icpDefinitionId: icpId }).returning();
  return created;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: accountId, icpId } = await params;
  const { data, error } = await parseBody(request, addTwitterAlphaFeedSageBodySchema);
  if (error) return error;

  const row = await ensureRow(accountId, icpId);
  const sages: TwitterAlphaFeedSage[] = (row.sages ?? []) as TwitterAlphaFeedSage[];

  // Normalise: extract handle from URL or @handle input
  const handle = extractTwitterHandle(data.twitterUrl) ?? undefined;
  const twitterUrl = data.twitterUrl.startsWith("@")
    ? `https://x.com/${data.twitterUrl.slice(1).toLowerCase()}`
    : data.twitterUrl;

  if (sages.some((s) => s.twitterUrl === twitterUrl)) {
    return NextResponse.json({ error: "Sage already exists" }, { status: 409 });
  }

  sages.push({
    twitterUrl,
    twitterHandle: handle,
    displayName: data.displayName || handle || "",
    bio: data.bio,
    active: true,
  });

  const [updated] = await db
    .update(twitterAlphaFeeds)
    .set({ sages, updatedAt: new Date() })
    .where(eq(twitterAlphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ twitterAlphaFeed: updated }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, toggleTwitterAlphaFeedSageBodySchema);
  if (error) return error;

  const [row] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Twitter alpha feed not found" }, { status: 404 });

  const sages: TwitterAlphaFeedSage[] = (row.sages ?? []) as TwitterAlphaFeedSage[];
  const sage = sages.find((s) => s.twitterUrl === data.twitterUrl);
  if (!sage) return NextResponse.json({ error: "Sage not found" }, { status: 404 });

  sage.active = data.active;

  const [updated] = await db
    .update(twitterAlphaFeeds)
    .set({ sages, updatedAt: new Date() })
    .where(eq(twitterAlphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ twitterAlphaFeed: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, removeTwitterAlphaFeedSageBodySchema);
  if (error) return error;

  const [row] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Twitter alpha feed not found" }, { status: 404 });

  const sages: TwitterAlphaFeedSage[] = (row.sages ?? []) as TwitterAlphaFeedSage[];
  const filtered = sages.filter((s) => s.twitterUrl !== data.twitterUrl);

  const [updated] = await db
    .update(twitterAlphaFeeds)
    .set({ sages: filtered, updatedAt: new Date() })
    .where(eq(twitterAlphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ twitterAlphaFeed: updated });
}
