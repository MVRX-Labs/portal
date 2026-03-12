/**
 * Knowledge Hub — User registry from Slack.
 *
 * Source of truth for user names. Loaded from Slack API,
 * cached in memory for the duration of a run.
 * Used to normalise assignee/requestedBy names in extraction.
 */

interface SlackUser {
  id: string;
  realName: string;
  displayName: string;
  email: string | null;
  teamId: string;
  isBot: boolean;
  side: "mvrx" | "client" | "system";
}

const MVRX_TEAM_IDS = new Set(["T07LGKRJ2AC", "T0A72PKB8R2"]);

// Module-level logger — can be overridden via setUserRegistryLogger() for Trigger.dev structured logs
let _logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } = console;

/** Set the logger for user registry operations (call from Trigger tasks). */
export function setUserRegistryLogger(logger: { info: (msg: string) => void; warn?: (msg: string) => void; error: (msg: string) => void }): void {
  _logger = { info: logger.info, warn: logger.warn ?? logger.info, error: logger.error };
}

let userCache: SlackUser[] | null = null;

/**
 * Load all users from Slack. Cached for the duration of the process.
 */
export async function loadSlackUsers(): Promise<SlackUser[]> {
  if (userCache) return userCache;

  const token = process.env.KNOWLEDGE_SLACKBOT_TOKEN;
  if (!token) throw new Error("KNOWLEDGE_SLACKBOT_TOKEN not configured");

  const users: SlackUser[] = [];
  let cursor = "";
  let paginationError = false;

  do {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json()) as {
      ok: boolean;
      members: Array<{
        id: string;
        real_name?: string;
        deleted?: boolean;
        is_bot?: boolean;
        team_id: string;
        profile?: { real_name?: string; display_name?: string; email?: string };
      }>;
      response_metadata?: { next_cursor?: string };
    };

    if (!data.ok) {
      // Pagination failed mid-way — don't cache partial results
      paginationError = true;
      break;
    }

    for (const m of data.members) {
      if (m.deleted) continue;
      const realName = m.profile?.real_name || m.real_name || "";
      const isBot = m.is_bot || m.id === "USLACKBOT";
      users.push({
        id: m.id,
        realName,
        displayName: m.profile?.display_name || "",
        email: m.profile?.email || null,
        teamId: m.team_id,
        isBot,
        side: isBot ? "system" : MVRX_TEAM_IDS.has(m.team_id) ? "mvrx" : "client",
      });
    }

    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  if (paginationError) {
    // Return partial results WITHOUT caching so the next call retries the full list
    // Non-fatal: degrade gracefully with partial data
    _logger.warn("[user-registry] users.list pagination failed — returning partial results without caching");
    return users;
  }

  // For shared channels, cross-workspace users aren't in users.list.
  // Load them from channel memberships.
  await loadCrossWorkspaceUsers(token, users);

  // Only cache after full pagination + cross-workspace load succeeds
  userCache = users;
  return users;
}

/** Load users from shared channels who aren't in our workspace. */
async function loadCrossWorkspaceUsers(token: string, users: SlackUser[]): Promise<void> {
  const knownIds = new Set(users.map((u) => u.id));

  // Get all knowledge channels to find shared channel members
  const { db } = await import("@/lib/db");
  const { knowledgeChannels } = await import("@/lib/schema");
  const { eq } = await import("drizzle-orm");
  const channels = await db
    .select({ slackChannelId: knowledgeChannels.slackChannelId })
    .from(knowledgeChannels)
    .where(eq(knowledgeChannels.active, true));

  for (const ch of channels) {
    // Paginate conversations.members — shared channels can have 100+ members
    let memberCursor = "";
    const allMembers: string[] = [];
    do {
      const url = `https://slack.com/api/conversations.members?channel=${ch.slackChannelId}&limit=200${memberCursor ? `&cursor=${memberCursor}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { ok: boolean; members?: string[]; response_metadata?: { next_cursor?: string } };
      if (!data.ok || !data.members) break;
      allMembers.push(...data.members);
      memberCursor = data.response_metadata?.next_cursor || "";
    } while (memberCursor);

    if (allMembers.length === 0) continue;

    for (const uid of allMembers) {
      if (knownIds.has(uid)) continue;
      // Resolve this cross-workspace user
      try {
        const uRes = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const uData = (await uRes.json()) as { ok: boolean; user?: { id: string; real_name?: string; is_bot?: boolean; team_id: string; profile?: { real_name?: string; display_name?: string; email?: string } } };
        if (uData.ok && uData.user) {
          const m = uData.user;
          const realName = m.profile?.real_name || m.real_name || "";
          users.push({
            id: m.id,
            realName,
            displayName: m.profile?.display_name || "",
            email: m.profile?.email || null,
            teamId: m.team_id,
            isBot: m.is_bot || false,
            side: m.is_bot ? "system" : MVRX_TEAM_IDS.has(m.team_id) ? "mvrx" : "client",
          });
          knownIds.add(uid);
        }
      } catch (err) {
        // Non-fatal: one bad user shouldn't break the loop
        _logger.warn(`[user-registry] Failed to resolve cross-workspace user ${uid}: ${err instanceof Error ? err.message : String(err)}`);
        // Continue — one bad user shouldn't break the loop
      }
      // Rate limit: 200ms after EACH users.info call
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

/**
 * Resolve a raw name string to a canonical Slack user name.
 * Returns the canonical name if matched, or the original string if not.
 */
export async function resolveUserName(rawName: string): Promise<{
  canonicalName: string;
  slackUserId: string | null;
  matched: boolean;
}> {
  const users = await loadSlackUsers();
  const nameLower = rawName.toLowerCase().trim();

  // Exact match on realName
  const exact = users.find((u) => u.realName.toLowerCase() === nameLower);
  if (exact) return { canonicalName: exact.realName, slackUserId: exact.id, matched: true };

  // Exact match on displayName
  const display = users.find((u) => u.displayName.toLowerCase() === nameLower);
  if (display) return { canonicalName: display.realName, slackUserId: display.id, matched: true };

  // Partial match — name contains or is contained by
  const partial = users.find((u) => {
    const rn = u.realName.toLowerCase();
    return rn.includes(nameLower) || nameLower.includes(rn);
  });
  if (partial) return { canonicalName: partial.realName, slackUserId: partial.id, matched: true };

  // First name match
  const firstName = nameLower.split(/\s+/)[0];
  const firstNameMatch = users.find((u) => {
    const fn = u.realName.toLowerCase().split(/\s+/)[0];
    return fn === firstName && firstName.length > 2;
  });
  if (firstNameMatch) return { canonicalName: firstNameMatch.realName, slackUserId: firstNameMatch.id, matched: true };

  // Strip "(mvrx)" or "(client)" suffixes the LLM sometimes adds
  const stripped = rawName.replace(/\s*\((?:mvrx|client)\)\s*$/i, "").trim();
  if (stripped !== rawName) return resolveUserName(stripped);

  return { canonicalName: rawName, slackUserId: null, matched: false };
}

/** Clear the cache (between runs). */
export function clearUserRegistryCache(): void {
  userCache = null;
}
