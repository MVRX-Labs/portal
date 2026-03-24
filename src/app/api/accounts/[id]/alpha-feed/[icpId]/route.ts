import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alphaFeeds } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { icpId } = await params;

  const [row] = await db.select().from(alphaFeeds).where(eq(alphaFeeds.icpDefinitionId, icpId));

  return NextResponse.json({ alphaFeed: row ?? null });
}
