import { NextRequest, NextResponse } from "next/server";
import { addManagedProfile, listManagedProfiles } from "@/lib/managed-profiles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;
  const profiles = await listManagedProfiles(accountId);
  return NextResponse.json(profiles);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;
  const body = await request.json().catch(() => ({}));
  const linkedin_url = typeof body.linkedin_url === "string" ? body.linkedin_url : "";
  const display_name = typeof body.display_name === "string" ? body.display_name : "";
  const linkedin_slug = typeof body.linkedin_slug === "string" ? body.linkedin_slug : undefined;

  if (!linkedin_url) {
    return NextResponse.json({ error: "linkedin_url required" }, { status: 400 });
  }

  try {
    const profile = await addManagedProfile(
      accountId,
      linkedin_url,
      display_name,
      linkedin_slug,
    );
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
