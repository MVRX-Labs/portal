import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { twitterPosts, twitterProfiles } from "@/lib/schema";
import { eq, and, desc, isNotNull, inArray } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Find outbound profiles for this account
    const profiles = await db
      .select({ id: twitterProfiles.id })
      .from(twitterProfiles)
      .where(
        and(
          eq(twitterProfiles.accountId, id),
          eq(twitterProfiles.outboundEnabled, true),
          eq(twitterProfiles.active, true)
        )
      );

    if (profiles.length === 0) return NextResponse.json([]);

    const posts = await db
      .select()
      .from(twitterPosts)
      .where(
        and(
          inArray(
            twitterPosts.profileId,
            profiles.map((p) => p.id)
          ),
          isNotNull(twitterPosts.engagementStatus)
        )
      )
      .orderBy(desc(twitterPosts.postedAt));

    return NextResponse.json(posts);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
