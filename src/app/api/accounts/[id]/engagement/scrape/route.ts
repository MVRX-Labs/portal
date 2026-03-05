import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { listProfiles } from "@/lib/engagement-bot-db";
import type { outboundEngagementScrapeTask } from "@/trigger/outbound-engagement-scrape";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [account] = await db.select({ channel: accounts.engagementSlackChannel }).from(accounts).where(eq(accounts.id, id));
    if (!account?.channel) {
      return NextResponse.json({ error: "Configure a Slack channel before scraping" }, { status: 400 });
    }

    const profiles = await listProfiles(id);
    if (profiles.length === 0) {
      return NextResponse.json({ error: "No profiles to scrape" }, { status: 400 });
    }

    const handles = await Promise.all(
      profiles.map((p) =>
        tasks.trigger<typeof outboundEngagementScrapeTask>("outbound-engagement-scrape", {
          accountId: id,
          profileId: p.id,
          maxPosts: 10,
        }),
      ),
    );

    return NextResponse.json({ triggered: profiles.length, runs: handles.map((h) => h.id) });
  } catch (err) {
    console.error("[engagement-scrape] Failed to trigger scrape:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
