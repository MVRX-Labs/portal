/**
 * Slack API client for Knowledge Hub ingestion.
 *
 * READ-ONLY. This module must never write to Slack channels.
 * All methods use GET/POST reads only (conversations.*, users.*).
 */

import type { SlackMessage, SlackUser } from "./types";

const SLACK_API = "https://slack.com/api";

function getToken(): string {
  const token = process.env.KNOWLEDGE_SLACKBOT_TOKEN;
  if (!token) throw new Error("KNOWLEDGE_SLACKBOT_TOKEN not configured");
  return token;
}

async function slackGet<T>(method: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${SLACK_API}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Slack ${method} failed: ${data.error}`);
  }
  return data as T;
}

/**
 * Fetch channel message history with pagination.
 * Returns messages in chronological order (oldest first).
 */
export async function fetchChannelHistory(
  channelId: string,
  opts: { oldest?: string; limit?: number } = {},
): Promise<SlackMessage[]> {
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;
  const perPage = Math.min(opts.limit ?? 200, 200);

  do {
    const params: Record<string, string> = {
      channel: channelId,
      limit: String(perPage),
    };
    if (opts.oldest) params.oldest = opts.oldest;
    if (cursor) params.cursor = cursor;

    const data = await slackGet<{
      messages: SlackMessage[];
      has_more: boolean;
      response_metadata?: { next_cursor?: string };
    }>("conversations.history", params);

    allMessages.push(...data.messages);
    cursor = data.response_metadata?.next_cursor || undefined;

    // Rate-limit courtesy: 50 calls/min for conversations.history (Tier 3)
    if (cursor) await sleep(300);
  } while (cursor && (!opts.limit || allMessages.length < opts.limit));

  // Slack returns newest-first; reverse to chronological
  return allMessages.reverse();
}

/**
 * Fetch all replies in a thread.
 * Returns replies only (excludes the parent message).
 */
export async function fetchThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
  const data = await slackGet<{ messages: SlackMessage[] }>("conversations.replies", {
    channel: channelId,
    ts: threadTs,
    limit: "200",
  });

  // First message is the parent; skip it
  return data.messages.slice(1);
}

/**
 * Get channel info (name, type, shared status).
 */
export async function fetchChannelInfo(channelId: string): Promise<{
  name: string;
  isPrivate: boolean;
  isShared: boolean;
  connectedTeamIds: string[];
}> {
  const data = await slackGet<{
    channel: {
      name: string;
      is_private: boolean;
      is_shared: boolean;
      is_ext_shared: boolean;
      connected_team_ids?: string[];
    };
  }>("conversations.info", { channel: channelId });

  return {
    name: data.channel.name,
    isPrivate: data.channel.is_private,
    isShared: data.channel.is_shared || data.channel.is_ext_shared,
    connectedTeamIds: data.channel.connected_team_ids ?? [],
  };
}

/** User cache to avoid repeated lookups within a single run. */
const userCache = new Map<string, SlackUser>();

/**
 * Resolve a Slack user ID to profile info.
 * Results are cached for the lifetime of the process.
 */
export async function resolveUser(userId: string): Promise<SlackUser> {
  const cached = userCache.get(userId);
  if (cached) return cached;

  const data = await slackGet<{
    user: {
      id: string;
      real_name?: string;
      is_bot: boolean;
      team_id: string;
      profile: {
        real_name?: string;
        display_name?: string;
        email?: string;
      };
    };
  }>("users.info", { user: userId });

  const user: SlackUser = {
    id: data.user.id,
    realName: data.user.profile.real_name ?? data.user.real_name ?? "Unknown",
    displayName: data.user.profile.display_name ?? "",
    email: data.user.profile.email,
    teamId: data.user.team_id,
    isBot: data.user.is_bot,
  };

  userCache.set(userId, user);
  return user;
}

/**
 * Download a file from Slack (for voice notes, etc.).
 * Returns the raw buffer.
 */
export async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download Slack file: ${res.status} ${res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
