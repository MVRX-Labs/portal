import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, managedProfiles } from "@/lib/schema";
import { eq, like } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk";
import { sendAnalyticsSlackMessage } from "@/lib/slack";
import type { trackPostTask } from "@/trigger/post-tracker";

const LINKEDIN_POST_RE =
  /https?:\/\/(?:www\.)?linkedin\.com\/(?:posts\/[^\s>|]+|feed\/update\/[^\s>|]+)/gi;

function extractAuthorSlugFromPostUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/posts\/([a-z0-9_-]+?)_/i);
  return match?.[1]?.toLowerCase() ?? null;
}

async function findAccountByChannel(channelId: string) {
  const rows = await db
    .select({ id: accounts.id, analyticsSlackChannel: accounts.analyticsSlackChannel })
    .from(accounts)
    .where(like(accounts.analyticsSlackChannel, `%${channelId}%`));

  return rows.find((r) => {
    const ids = (r.analyticsSlackChannel ?? "").split(",").map((s) => s.trim());
    return ids.includes(channelId);
  }) ?? null;
}

async function findProfileBySlug(accountId: string, slug: string) {
  const profiles = await db
    .select()
    .from(managedProfiles)
    .where(eq(managedProfiles.accountId, accountId));

  return profiles.find((p) => p.linkedinSlug === slug) ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Slack URL verification challenge
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Only handle event callbacks
  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = body.event;
  if (!event || event.type !== "app_mention") {
    return NextResponse.json({ ok: true });
  }

  const text: string = event.text ?? "";
  const channelId: string = event.channel;
  const threadTs: string = event.thread_ts ?? event.ts;

  // Extract all LinkedIn post URLs from message
  const postUrls = [...text.matchAll(LINKEDIN_POST_RE)]
    .map((m) => m[0].replace(/>$/, ""))
    .filter((url, i, arr) => arr.indexOf(url) === i); // dedupe

  if (postUrls.length === 0) {
    await sendAnalyticsSlackMessage(
      channelId,
      "Please include a LinkedIn post URL to track.",
      [{ type: "section", text: { type: "mrkdwn", text: "Please include a LinkedIn post URL to track." } }],
      { thread_ts: threadTs },
    ).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // Find which account owns this channel
  const account = await findAccountByChannel(channelId);
  if (!account) {
    await sendAnalyticsSlackMessage(
      channelId,
      "This channel isn't linked to any account's analytics. Set the Slack channel ID in the Analytics settings first.",
      [{ type: "section", text: { type: "mrkdwn", text: "This channel isn't linked to any account's analytics. Set the Slack channel ID in the Analytics settings first." } }],
      { thread_ts: threadTs },
    ).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // Acknowledge in thread
  const postWord = postUrls.length === 1 ? "post" : `${postUrls.length} posts`;
  const linkList = postUrls.map((url, i) => `<${url}|Post ${i + 1}>`).join(", ");
  await sendAnalyticsSlackMessage(
    channelId,
    `Tracking ${postWord} — will report at 5 min, 30 min, 1 hr, 2 hr, and 4 hr.`,
    [{
      type: "section",
      text: { type: "mrkdwn", text: `Tracking ${linkList} — will report at 5 min, 30 min, 1 hr, 2 hr, and 4 hr.` },
    }],
    { thread_ts: threadTs },
  ).catch(() => {});

  // Trigger snapshots at each checkpoint for each URL
  const checkpoints = [
    { delay: "5m", label: "5-Minute" },
    { delay: "30m", label: "30-Minute" },
    { delay: "1h", label: "1-Hour" },
    { delay: "2h", label: "2-Hour" },
    { delay: "4h", label: "4-Hour" },
  ];

  const triggers: Promise<unknown>[] = [];

  for (const postUrl of postUrls) {
    const authorSlug = extractAuthorSlugFromPostUrl(postUrl);
    let profileId: string | null = null;
    if (authorSlug) {
      const profile = await findProfileBySlug(account.id, authorSlug);
      profileId = profile?.id ?? null;
    }

    for (const cp of checkpoints) {
      triggers.push(
        tasks.trigger<typeof trackPostTask>("track-post", {
          postUrl,
          accountId: account.id,
          profileId,
          channelId,
          threadTs,
          label: cp.label,
        }, {
          delay: cp.delay,
        }),
      );
    }
  }

  await Promise.all(triggers);

  return NextResponse.json({ ok: true });
}
