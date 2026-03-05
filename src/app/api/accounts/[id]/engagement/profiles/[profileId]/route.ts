import { NextRequest, NextResponse } from "next/server";
import { getProfile, updateProfile, deleteProfile } from "@/lib/engagement-bot-db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  const { id, profileId } = await params;
  try {
    const profile = await getProfile(profileId);
    if (!profile || profile.accountId !== id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const body = await request.json();
    const allowedFields: Record<string, unknown> = {};
    if (typeof body.engagementPersona === "string") allowedFields.engagementPersona = body.engagementPersona;
    if (typeof body.displayName === "string") allowedFields.displayName = body.displayName;
    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }
    const updated = await updateProfile(profileId, allowedFields);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> },
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
