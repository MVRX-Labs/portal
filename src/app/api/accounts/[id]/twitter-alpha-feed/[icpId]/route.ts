import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { twitterAlphaFeeds } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { icpId } = await params;

  const [row] = await db.select().from(twitterAlphaFeeds).where(eq(twitterAlphaFeeds.icpDefinitionId, icpId));

  return NextResponse.json({ twitterAlphaFeed: row ?? null });
}
