import { NextRequest, NextResponse } from "next/server";
import { getProfile, updateProfile, deleteProfile } from "@/lib/engagement-bot-db";
import { parseBody } from "@/lib/api-schemas/common";
import { patchEngagementProfileBodySchema } from "@/lib/api-schemas/engagement";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; profileId: string }> }) {
  const { id, profileId } = await params;
  try {
    const profile = await getProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const { data, error } = await parseBody(request, patchEngagementProfileBodySchema);
    if (error) return error;

    const allowedFields: Record<string, unknown> = {};
    if (data.engagementPersona !== undefined) allowedFields.engagementPersona = data.engagementPersona;
    if (data.displayName !== undefined) allowedFields.displayName = data.displayName;

    const updated = await updateProfile(profileId, allowedFields);
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
    const profile = await getProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    await deleteProfile(profileId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
