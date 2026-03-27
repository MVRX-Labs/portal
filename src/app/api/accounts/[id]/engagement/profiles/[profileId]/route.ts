import { NextRequest, NextResponse } from "next/server";
import { getLinkedinProfile } from "@/lib/linkedin-profiles";
import { db } from "@/lib/db";
import { linkedinProfiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchEngagementProfileBodySchema } from "@/lib/api-schemas/linkedin-engagement";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; profileId: string }> }) {
  const { id, profileId } = await params;
  try {
    const profile = await getLinkedinProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const { data, error } = await parseBody(request, patchEngagementProfileBodySchema);
    if (error) return error;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.engagementPersona !== undefined) updates.engagementPersona = data.engagementPersona;
    if (data.displayName !== undefined) updates.displayName = data.displayName;

    const [updated] = await db
      .update(linkedinProfiles)
      .set(updates)
      .where(eq(linkedinProfiles.id, profileId))
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
    const profile = await getLinkedinProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Deactivate outbound rather than deleting (profile may serve other purposes)
    const [updated] = await db
      .update(linkedinProfiles)
      .set({ outboundEnabled: false, updatedAt: new Date() })
      .where(eq(linkedinProfiles.id, profileId))
      .returning();

    // If no features remain enabled, deactivate entirely
    if (updated && !updated.analyticsEnabled && !updated.inboundEnabled) {
      await db
        .update(linkedinProfiles)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(linkedinProfiles.id, profileId));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
