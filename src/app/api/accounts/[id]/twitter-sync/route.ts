import { NextRequest, NextResponse } from "next/server";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import { listTwitterProfiles } from "@/lib/twitter-profiles";
import type { twitterSyncProfileTask } from "@/trigger/twitter-sync";

/**
 * POST /api/accounts/[id]/twitter-sync
 *
 * Manually trigger a Twitter sync for all active profiles (or a single one).
 * Body: { profileId?: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  let profileId: string | undefined;
  try {
    const body = await request.json();
    profileId = body.profileId;
  } catch {
    // No body or invalid JSON — sync all profiles
  }

  try {
    let profiles = await listTwitterProfiles(accountId);

    if (profileId) {
      profiles = profiles.filter((p) => p.id === profileId);
      if (profiles.length === 0) {
        return NextResponse.json({ error: "Profile not found or not active" }, { status: 404 });
      }
    }

    if (profiles.length === 0) {
      return NextResponse.json({ error: "No active Twitter profiles to sync" }, { status: 400 });
    }

    const handles = await Promise.all(
      profiles.map((p) =>
        tasks.trigger<typeof twitterSyncProfileTask>("twitter-sync-profile", {
          accountId,
          profileId: p.id,
        })
      )
    );

    // Create public tokens so the caller can watch the runs
    const tokens = await Promise.all(
      handles.map((h) =>
        auth.createPublicToken({
          scopes: { read: { runs: [h.id] } },
          expirationTime: "1h",
        })
      )
    );

    return NextResponse.json({
      triggered: profiles.length,
      runs: handles.map((h, i) => ({
        runId: h.id,
        profileId: profiles[i].id,
        displayName: profiles[i].displayName || profiles[i].twitterHandle || profiles[i].twitterUrl,
        publicAccessToken: tokens[i],
      })),
    });
  } catch (err) {
    console.error("[twitter-sync] Failed to trigger sync:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
