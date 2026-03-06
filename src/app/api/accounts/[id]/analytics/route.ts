import { NextRequest, NextResponse } from "next/server";
import { getAccountGrowth, getPostDeltas } from "@/lib/post-analytics";
import { db } from "@/lib/db";
import { engagementProfiles } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  try {
    const growth = await getAccountGrowth(accountId);

    // Get per-post deltas for each profile
    const profiles = await db
      .select()
      .from(engagementProfiles)
      .where(eq(engagementProfiles.accountId, accountId));

    const profileDeltas: Record<string, Awaited<ReturnType<typeof getPostDeltas>>> = {};
    for (const p of profiles) {
      profileDeltas[p.id] = await getPostDeltas(p.id);
    }

    return NextResponse.json({
      growth,
      profileDeltas,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
