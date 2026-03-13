import { NextRequest, NextResponse } from "next/server";
import { getLinkedinProfile } from "@/lib/linkedin-profiles";
import { db } from "@/lib/db";
import { linkedinProfiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchLinkedinProfileBodySchema } from "@/lib/api-schemas/linkedin-profiles";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; profileId: string }> }) {
  const { id: accountId, profileId } = await params;
  try {
    const profile = await getLinkedinProfile(profileId);
    if (!profile || profile.accountId !== accountId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data, error } = await parseBody(request, patchLinkedinProfileBodySchema);
    if (error) return error;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.analyticsEnabled !== undefined) updates.analyticsEnabled = data.analyticsEnabled;
    if (data.outboundEnabled !== undefined) updates.outboundEnabled = data.outboundEnabled;
    if (data.inboundEnabled !== undefined) updates.inboundEnabled = data.inboundEnabled;

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
