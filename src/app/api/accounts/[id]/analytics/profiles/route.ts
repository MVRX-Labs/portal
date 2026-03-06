import { NextRequest, NextResponse } from "next/server";
import { addManagedProfile, listManagedProfiles } from "@/lib/post-analytics";

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
  const body = await request.json();
  const { linkedin_url, display_name, linkedin_slug } = body;

  if (!linkedin_url) {
    return NextResponse.json({ error: "linkedin_url required" }, { status: 400 });
  }

  const profile = await addManagedProfile(
    accountId,
    linkedin_url,
    display_name || "",
    linkedin_slug,
  );
  return NextResponse.json(profile, { status: 201 });
}
