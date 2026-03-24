import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alphaFeeds, type AlphaFeedSage } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import {
  addAlphaFeedSageBodySchema,
  toggleAlphaFeedSageBodySchema,
  removeAlphaFeedSageBodySchema,
} from "@/lib/api-schemas/alpha-feed";

type Params = { params: Promise<{ id: string; icpId: string }> };

/** Ensure an alpha_feeds row exists for this ICP, return it. */
async function ensureRow(accountId: string, icpId: string) {
  const [existing] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (existing) return existing;

  const [created] = await db.insert(alphaFeeds).values({ accountId, icpDefinitionId: icpId }).returning();
  return created;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: accountId, icpId } = await params;
  const { data, error } = await parseBody(request, addAlphaFeedSageBodySchema);
  if (error) return error;

  const row = await ensureRow(accountId, icpId);
  const sages: AlphaFeedSage[] = (row.sages ?? []) as AlphaFeedSage[];

  if (sages.some((s) => s.linkedinUrl === data.linkedinUrl)) {
    return NextResponse.json({ error: "Sage already exists" }, { status: 409 });
  }

  sages.push({
    linkedinUrl: data.linkedinUrl,
    displayName: data.displayName || "",
    headline: data.headline,
    active: true,
  });

  const [updated] = await db
    .update(alphaFeeds)
    .set({ sages, updatedAt: new Date() })
    .where(eq(alphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ alphaFeed: updated }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, toggleAlphaFeedSageBodySchema);
  if (error) return error;

  const [row] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Alpha feed not found" }, { status: 404 });

  const sages: AlphaFeedSage[] = (row.sages ?? []) as AlphaFeedSage[];
  const sage = sages.find((s) => s.linkedinUrl === data.linkedinUrl);
  if (!sage) return NextResponse.json({ error: "Sage not found" }, { status: 404 });

  sage.active = data.active;

  const [updated] = await db
    .update(alphaFeeds)
    .set({ sages, updatedAt: new Date() })
    .where(eq(alphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ alphaFeed: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { icpId } = await params;
  const { data, error } = await parseBody(request, removeAlphaFeedSageBodySchema);
  if (error) return error;

  const [row] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  if (!row) return NextResponse.json({ error: "Alpha feed not found" }, { status: 404 });

  const sages: AlphaFeedSage[] = (row.sages ?? []) as AlphaFeedSage[];
  const filtered = sages.filter((s) => s.linkedinUrl !== data.linkedinUrl);

  const [updated] = await db
    .update(alphaFeeds)
    .set({ sages: filtered, updatedAt: new Date() })
    .where(eq(alphaFeeds.id, row.id))
    .returning();

  return NextResponse.json({ alphaFeed: updated });
}
