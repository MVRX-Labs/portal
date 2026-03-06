import { NextRequest, NextResponse } from "next/server";
import { listManagedProfiles, ingestPosts } from "@/lib/post-analytics";

const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_ACTOR_ID = "supreme_coder/linkedin-post";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;
  const body = await request.json().catch(() => ({}));
  const profileId = body.profile_id;

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_API_TOKEN not configured" }, { status: 500 });
  }

  // Get profiles to scrape
  let profiles = await listManagedProfiles(accountId);
  if (profileId) {
    profiles = profiles.filter((p) => p.id === profileId);
  }

  if (profiles.length === 0) {
    return NextResponse.json({ error: "No managed profiles found" }, { status: 404 });
  }

  const results: Array<{ profileId: string; name: string; total: number; newCount: number }> = [];

  for (const profile of profiles) {
    try {
      const url = `${APIFY_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/run-sync-get-dataset-items?token=${token}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [profile.linkedinUrl], maxPosts: 50 }),
      });

      if (!res.ok) {
        const text = await res.text();
        results.push({ profileId: profile.id, name: profile.displayName, total: 0, newCount: 0 });
        continue;
      }

      const rawPosts = (await res.json()) as Record<string, unknown>[];
      const { total, newCount } = await ingestPosts(profile.id, accountId, rawPosts);
      results.push({ profileId: profile.id, name: profile.displayName, total, newCount });
    } catch (err) {
      results.push({ profileId: profile.id, name: profile.displayName, total: 0, newCount: 0 });
    }
  }

  return NextResponse.json({ results });
}
