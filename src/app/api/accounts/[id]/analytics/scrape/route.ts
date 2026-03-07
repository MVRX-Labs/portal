import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { listManagedProfiles } from "@/lib/managed-profiles";
import type { weeklyAnalyticsTask } from "@/trigger/analytics-scrape";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;
  const body = await request.json().catch(() => ({}));
  const profileId = typeof body.profile_id === "string" ? body.profile_id : undefined;

  try {
    let profiles = await listManagedProfiles(accountId);
    if (profileId) {
      profiles = profiles.filter((p) => p.id === profileId);
    }

    if (profiles.length === 0) {
      return NextResponse.json({ error: "No managed profiles found" }, { status: 404 });
    }

    const handles = await Promise.all(
      profiles.map((p) =>
        tasks.trigger<typeof weeklyAnalyticsTask>("weekly-analytics", {
          accountId,
          profileId: p.id,
          maxPosts: 200,
        }),
      ),
    );

    return NextResponse.json({
      triggered: profiles.length,
      runs: handles.map((h) => h.id),
      profiles: profiles.map((p) => ({ id: p.id, name: p.displayName || p.linkedinUrl })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
