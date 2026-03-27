import { NextRequest, NextResponse } from "next/server";
import { listTwitterProfiles, addTwitterProfile } from "@/lib/twitter-profiles";
import { parseBody } from "@/lib/api-schemas/common";
import { createTwitterEngagementProfilesBodySchema } from "@/lib/api-schemas/twitter-engagement";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const profiles = await listTwitterProfiles(id, { outboundEnabled: true });
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { data, error } = await parseBody(request, createTwitterEngagementProfilesBodySchema);
    if (error) return error;

    const profiles = [];
    for (const url of data.twitter_urls) {
      const profile = await addTwitterProfile(id, url, {
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
