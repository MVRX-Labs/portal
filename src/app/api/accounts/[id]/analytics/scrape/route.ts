import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { listLinkedinProfiles } from "@/lib/linkedin-profiles";
import type { weeklyAnalyticsTask } from "@/trigger/linkedin-analytics-scrape";
import { parseBody } from "@/lib/api-schemas/common";
import { analyticsScrapeBodySchema } from "@/lib/api-schemas/analytics";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const { data } = await parseBody(request, analyticsScrapeBodySchema).catch(() => ({
    data: { profile_id: undefined } as { profile_id?: string },
    error: null,
  }));

  try {
    let profiles = await listLinkedinProfiles(accountId, { analyticsEnabled: true });
    if (data.profile_id) {
      profiles = profiles.filter((p) => p.id === data.profile_id);
    }

    if (profiles.length === 0) {
      return NextResponse.json({ error: "No analytics profiles found" }, { status: 404 });
    }

    const handles = await Promise.all(
      profiles.map((p) =>
        tasks.trigger<typeof weeklyAnalyticsTask>("weekly-analytics", {
          accountId,
          profileId: p.id,
        })
      )
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
