import { NextRequest, NextResponse } from "next/server";
import { addLinkedinProfile, listLinkedinProfiles } from "@/lib/linkedin-profiles";
import { parseBody } from "@/lib/api-schemas/common";
import { createAnalyticsProfileBodySchema } from "@/lib/api-schemas/analytics";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const profiles = await listLinkedinProfiles(accountId, { analyticsEnabled: true });
  return NextResponse.json(profiles);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const { data, error } = await parseBody(request, createAnalyticsProfileBodySchema);
  if (error) return error;

  try {
    const profile = await addLinkedinProfile(accountId, data.linkedin_url, {
      displayName: data.display_name || "",
      linkedinSlug: data.linkedin_slug,
      analyticsEnabled: true,
    });
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
