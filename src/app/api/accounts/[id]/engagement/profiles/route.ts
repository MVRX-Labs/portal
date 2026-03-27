import { NextRequest, NextResponse } from "next/server";
import { listLinkedinProfiles, addLinkedinProfile } from "@/lib/linkedin-profiles";
import { parseBody } from "@/lib/api-schemas/common";
import { createEngagementProfilesBodySchema } from "@/lib/api-schemas/linkedin-engagement";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const profiles = await listLinkedinProfiles(id, { outboundEnabled: true });
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { data, error } = await parseBody(request, createEngagementProfilesBodySchema);
    if (error) return error;

    const profiles = [];
    for (const url of data.linkedin_urls) {
      const profile = await addLinkedinProfile(id, url, {
        outboundEnabled: true,
        engagementPersona: data.engagement_persona || "",
      });
      profiles.push(profile);
    }
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
