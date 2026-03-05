import { NextRequest, NextResponse } from "next/server";
import { listProfiles, bulkCreateProfiles } from "@/lib/engagement-bot-db";

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
    const body = await request.json();
    if (!Array.isArray(body.linkedin_urls) || body.linkedin_urls.length === 0) {
      return NextResponse.json({ error: "linkedin_urls must be a non-empty array" }, { status: 400 });
    }
    const profiles = await bulkCreateProfiles(
      id,
      body.linkedin_urls,
      body.engagement_persona || "",
    );
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
