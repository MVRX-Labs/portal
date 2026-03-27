import { NextRequest, NextResponse } from "next/server";
import { getTwitterProfile } from "@/lib/twitter-profiles";
import { db } from "@/lib/db";
import { twitterProfiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchTwitterProfileBodySchema } from "@/lib/api-schemas/twitter-profiles";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; profileId: string }> }) {
  const { id: accountId, profileId } = await params;
  try {
    const profile = await getTwitterProfile(profileId);
    if (!profile || profile.accountId !== accountId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data, error } = await parseBody(request, patchTwitterProfileBodySchema);
    if (error) return error;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.analyticsEnabled !== undefined) updates.analyticsEnabled = data.analyticsEnabled;
    if (data.outboundEnabled !== undefined) updates.outboundEnabled = data.outboundEnabled;
    if (data.inboundEnabled !== undefined) updates.inboundEnabled = data.inboundEnabled;

    const [updated] = await db
      .update(twitterProfiles)
      .set(updates)
      .where(eq(twitterProfiles.id, profileId))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
