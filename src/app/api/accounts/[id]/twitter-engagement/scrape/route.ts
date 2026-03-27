import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { listTwitterProfiles } from "@/lib/twitter-profiles";
import type { twitterSyncProfileTask } from "@/trigger/twitter-sync";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [account] = await db
      .select({ channel: accounts.twitterEngagementSlackChannel })
      .from(accounts)
      .where(eq(accounts.id, id));
    if (!account?.channel) {
      return NextResponse.json({ error: "Configure a Slack channel before scraping" }, { status: 400 });
    }

    const profiles = await listTwitterProfiles(id, { outboundEnabled: true });
    if (profiles.length === 0) {
      return NextResponse.json({ error: "No outbound profiles to scrape" }, { status: 400 });
    }

    const handles = await Promise.all(
      profiles.map((p) =>
        tasks.trigger<typeof twitterSyncProfileTask>("twitter-sync-profile", {
          accountId: id,
          profileId: p.id,
        })
      )
    );

    return NextResponse.json({ triggered: profiles.length, runs: handles.map((h) => h.id) });
  } catch (err) {
    console.error("[twitter-engagement-scrape] Failed to trigger sync:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
