import { NextRequest, NextResponse } from "next/server";
import { listProfiles, bulkCreateProfiles } from "@/lib/engagement-bot-db";
import { parseBody } from "@/lib/api-schemas/common";
import { createEngagementProfilesBodySchema } from "@/lib/api-schemas/engagement";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const profiles = await listProfiles(id);
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

    const profiles = await bulkCreateProfiles(id, data.linkedin_urls, data.engagement_persona || "");
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
