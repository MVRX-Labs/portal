import { NextRequest, NextResponse } from "next/server";
import { getTwitterProfile } from "@/lib/twitter-profiles";
import { db } from "@/lib/db";
import { twitterProfiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchTwitterEngagementProfileBodySchema } from "@/lib/api-schemas/twitter-engagement";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; profileId: string }> }) {
  const { id, profileId } = await params;
  try {
    const profile = await getTwitterProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const { data, error } = await parseBody(request, patchTwitterEngagementProfileBodySchema);
    if (error) return error;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.engagementPersona !== undefined) updates.engagementPersona = data.engagementPersona;
    if (data.displayName !== undefined) updates.displayName = data.displayName;

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  const { id, profileId } = await params;
  try {
    const profile = await getTwitterProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Deactivate outbound rather than deleting (profile may serve other purposes)
    const [updated] = await db
      .update(twitterProfiles)
      .set({ outboundEnabled: false, updatedAt: new Date() })
      .where(eq(twitterProfiles.id, profileId))
      .returning();

    // If no features remain enabled, deactivate entirely
    if (updated && !updated.analyticsEnabled && !updated.inboundEnabled) {
      await db
        .update(twitterProfiles)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(twitterProfiles.id, profileId));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
