import { NextRequest, NextResponse } from "next/server";
import { addManagedProfile, listManagedProfiles } from "@/lib/managed-profiles";
import { parseBody } from "@/lib/api-schemas/common";
import { createAnalyticsProfileBodySchema } from "@/lib/api-schemas/analytics";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const profiles = await listManagedProfiles(accountId);
  return NextResponse.json(profiles);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const { data, error } = await parseBody(request, createAnalyticsProfileBodySchema);
  if (error) return error;

  try {
    const profile = await addManagedProfile(accountId, data.linkedin_url, data.display_name || "", data.linkedin_slug);
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
