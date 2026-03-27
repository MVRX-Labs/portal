import { NextRequest, NextResponse } from "next/server";
import { listTwitterProfiles, addTwitterProfile } from "@/lib/twitter-profiles";
import { parseBody } from "@/lib/api-schemas/common";
import { z } from "zod";

const createTwitterProfileBodySchema = z.object({
  twitter_url: z.string().min(1, "twitter_url is required"),
  display_name: z.string().optional(),
  twitter_handle: z.string().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const profiles = await listTwitterProfiles(accountId);
  return NextResponse.json({ profiles });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  const { data, error } = await parseBody(request, createTwitterProfileBodySchema);
  if (error) return error;

  try {
    const profile = await addTwitterProfile(accountId, data.twitter_url, {
      displayName: data.display_name,
      twitterHandle: data.twitter_handle,
    });
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
