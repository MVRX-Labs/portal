import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { linkedinPosts, linkedinProfiles } from "@/lib/schema";
import { eq, and, desc, isNotNull, inArray } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Find outbound profiles for this account
    const profiles = await db
      .select({ id: linkedinProfiles.id })
      .from(linkedinProfiles)
      .where(
        and(
          eq(linkedinProfiles.accountId, id),
          eq(linkedinProfiles.outboundEnabled, true),
          eq(linkedinProfiles.active, true)
        )
      );

    if (profiles.length === 0) return NextResponse.json([]);

    const posts = await db
      .select()
      .from(linkedinPosts)
      .where(
        and(
          inArray(
            linkedinPosts.profileId,
            profiles.map((p) => p.id)
          ),
          isNotNull(linkedinPosts.engagementStatus)
        )
      )
      .orderBy(desc(linkedinPosts.postedAt));

    return NextResponse.json(posts);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
