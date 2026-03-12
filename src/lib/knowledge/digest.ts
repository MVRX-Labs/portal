/**
 * Knowledge Hub — Daily digest generator.
 *
 * Sends a threaded digest: parent message = summary stats, each item = its own
 * threaded reply so reactions can be tracked back to individual knowledge units.
 *
 * Flow:
 *   1. Load all open units, group by account
 *   2. Flag stale items (>3 weeks, no activity)
 *   3. Send parent summary DM to each recipient
 *   4. Post account header as threaded reply
 *   5. Post EACH open item as an individual threaded reply (rate-limited 1/1.2s)
 *   6. Post recently-done items as consolidated message at end of each account
 *   7. Persist {unitId → messageTs, channelId, threadTs} in knowledge_digest_messages
 */

import { db } from "@/lib/db";
import { knowledgeUnits, accounts, knowledgeDigestMessages } from "@/lib/schema";
import { eq, desc, or, and, gt } from "drizzle-orm";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

// Recipients for daily digest DMs
const DIGEST_RECIPIENTS = [
  "U0ACUKDKYGK", // Tarun Odedra
  "U0AJ4E662G1", // Nitanshu
];

const TYPE_EMOJI: Record<string, string> = {
  action_item: "🔹",
  decision: "⚖️",
  request: "📩",
  blocker: "🚫",
  deliverable: "📦",
  feedback: "💬",
  context_update: "📝",
  content_draft: "✍️",
  product_bug: "🐛",
  product_feature: "✨",
};

interface DigestSection {
  accountName: string;
  accountSlug: string;
  openItems: Array<{ id: string; type: string; content: string; assignee: string | null; stale: boolean }>;
  recentlyDone: Array<{ id: string; content: string; assignee: string | null }>;
  stats: { total: number; open: number; done: number; stale: number };
}

// --- Slack helpers ---

function getToken(): string {
  const token = process.env.KNOWLEDGE_SLACKBOT_TOKEN;
  if (!token) throw new Error("KNOWLEDGE_SLACKBOT_TOKEN not configured");
  return token;
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

async function openDM(userId: string): Promise<string> {
  const data = await slackPost("conversations.open", { users: userId });
  return (data.channel as { id: string }).id;
}

async function postMessage(channel: string, text: string, blocks?: Record<string, unknown>[]): Promise<string> {
  const body: Record<string, unknown> = { channel, text };
  if (blocks) body.blocks = blocks;
  const data = await slackPost("chat.postMessage", body);
  return data.ts as string;
}

async function postThreadReply(
  channel: string,
  threadTs: string,
  text: string,
  blocks?: Record<string, unknown>[],
): Promise<string> {
  const body: Record<string, unknown> = { channel, text, thread_ts: threadTs };
  if (blocks) body.blocks = blocks;
  const data = await slackPost("chat.postMessage", body);
  return data.ts as string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main ---

/**
 * Generate and send the daily digest as threaded messages.
 * Parent = summary, each item = individual threaded reply with reaction tracking.
 */
export async function generateAndSendDigest(logger: Logger): Promise<{ sections: number; messagesSent: number }> {
  const sections = await buildDigestSections(logger);

  if (sections.length === 0) {
    logger.info("No accounts with open items — skipping digest");
    return { sections: 0, messagesSent: 0 };
  }

  let totalSent = 0;

  for (const userId of DIGEST_RECIPIENTS) {
    try {
      const sent = await sendThreadedDigest(userId, sections, logger);
      totalSent += sent;
      logger.info(`Digest sent to ${userId}: ${sent} messages`);
    } catch (err) {
      logger.error(`Failed to send digest to ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { sections: sections.length, messagesSent: totalSent };
}

async function sendThreadedDigest(
  userId: string,
  sections: DigestSection[],
  logger: Logger,
): Promise<number> {
  const channelId = await openDM(userId);
  let messageCount = 0;

  // Accumulate mappings — persist all at once after sending
  const digestMappings: Array<{
    unitId: string;
    recipientSlackId: string;
    channelId: string;
    threadTs: string;
    messageTs: string;
  }> = [];

  // 1. Parent message — summary stats
  const totalOpen = sections.reduce((s, sec) => s + sec.stats.open, 0);
  const totalDone = sections.reduce((s, sec) => s + sec.stats.done, 0);
  const totalStale = sections.reduce((s, sec) => s + sec.stats.stale, 0);
  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

  const accountSummaries = sections
    .map((s) => `• *${s.accountName}*: ${s.stats.open} open${s.stats.stale > 0 ? ` (⚠️ ${s.stats.stale} stale)` : ""}`)
    .join("\n");

  const parentBlocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "📋 Knowledge Hub — Daily Digest" },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${date} · ${totalOpen} open · ${totalDone} done recently${totalStale > 0 ? ` · ⚠️ ${totalStale} stale` : ""}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: accountSummaries },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Each item is posted below. React ✅ on an item to mark it done." }],
    },
  ];

  const parentTs = await postMessage(
    channelId,
    `📋 Daily Digest — ${totalOpen} open items across ${sections.length} accounts`,
    parentBlocks,
  );
  messageCount++;
  await sleep(1200);

  // 2. For each account: post header, then each item individually
  for (const section of sections) {
    // Account header message
    const headerText =
      `*── ${section.accountName} ── ${section.stats.open} open` +
      `${section.stats.stale > 0 ? ` · ⚠️ ${section.stats.stale} stale` : ""} ──*`;

    await postThreadReply(channelId, parentTs, headerText, [
      { type: "section", text: { type: "mrkdwn", text: headerText } },
    ]);
    messageCount++;
    logger.info(`Posted account header for ${section.accountName}`);
    await sleep(1200);

    // Each open item as its own thread reply
    for (const item of section.openItems) {
      const emoji = TYPE_EMOJI[item.type] || "🔹";
      const assigneeTag = item.assignee ? `\n→ *${item.assignee}*` : "";
      const typeTag = item.type !== "action_item" ? `\n_[${item.type.replace(/_/g, " ")}]_` : "";
      const staleWarning = item.stale ? "\n⚠️ _Stale — no activity in 3+ weeks_" : "";
      const contextLine = `\nReact ✅ to mark done · ID: \`${item.id}\``;
      const content = item.content.slice(0, 500) + (item.content.length > 500 ? "…" : "");
      const itemText = `${emoji} ${content}${assigneeTag}${typeTag}${staleWarning}${contextLine}`;

      const messageTs = await postThreadReply(channelId, parentTs, itemText, [
        { type: "section", text: { type: "mrkdwn", text: itemText } },
      ]);
      messageCount++;

      digestMappings.push({
        unitId: item.id,
        recipientSlackId: userId,
        channelId,
        threadTs: parentTs,
        messageTs,
      });

      await sleep(1200);
    }

    // Recently-done items for this account — consolidated message
    if (section.recentlyDone.length > 0) {
      const doneLines = section.recentlyDone
        .map((item) => {
          const assigneeTag = item.assignee ? ` → ${item.assignee}` : "";
          return `✅ ~${item.content.slice(0, 100)}${item.content.length > 100 ? "…" : ""}~${assigneeTag}`;
        })
        .join("\n");
      const doneText = `*Recently completed in ${section.accountName}:*\n${doneLines}`;

      await postThreadReply(channelId, parentTs, doneText, [
        { type: "section", text: { type: "mrkdwn", text: doneText } },
      ]);
      messageCount++;
      await sleep(1200);
    }
  }

  // 3. Persist digest message mappings to DB
  if (digestMappings.length > 0) {
    try {
      await db.insert(knowledgeDigestMessages).values(
        digestMappings.map((m) => ({
          unitId: m.unitId,
          recipientSlackId: m.recipientSlackId,
          channelId: m.channelId,
          threadTs: m.threadTs,
          messageTs: m.messageTs,
        })),
      );
      logger.info(`Stored ${digestMappings.length} digest message mappings for ${userId}`);
    } catch (err) {
      logger.error(`Failed to store digest mappings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return messageCount;
}

// --- Data loading ---

async function buildDigestSections(logger: Logger): Promise<DigestSection[]> {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const allUnits = await db
    .select({
      id: knowledgeUnits.id,
      type: knowledgeUnits.unitType,
      content: knowledgeUnits.content,
      assignee: knowledgeUnits.assignee,
      status: knowledgeUnits.status,
      accountId: knowledgeUnits.accountId,
      metadata: knowledgeUnits.metadata,
      createdAt: knowledgeUnits.createdAt,
    })
    .from(knowledgeUnits)
    .where(
      or(
        eq(knowledgeUnits.status, "open"),
        and(eq(knowledgeUnits.status, "done"), gt(knowledgeUnits.createdAt, twoDaysAgo)),
      ),
    )
    .orderBy(desc(knowledgeUnits.createdAt));

  const accountRows = await db.select({ id: accounts.id, name: accounts.name, slug: accounts.slug }).from(accounts);
  const accountMap = new Map(accountRows.map((a) => [a.id, a]));

  const byAccount = new Map<string | null, typeof allUnits>();
  for (const u of allUnits) {
    const key = u.accountId;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(u);
  }

  const sections: DigestSection[] = [];
  const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const [accountId, units] of byAccount) {
    const account = accountId ? accountMap.get(accountId) : null;
    const open = units.filter((u) => u.status === "open");
    const done = units.filter((u) => u.status === "done");

    const stale = open.filter((u) => {
      const meta = u.metadata as Record<string, unknown> | null;
      if (meta?.stale) return true;
      const created = u.createdAt ? new Date(u.createdAt) : null;
      return created && created < threeWeeksAgo;
    });

    const recentlyDone = done.filter((u) => {
      const meta = u.metadata as Record<string, unknown> | null;
      const completedAt = meta?.completedAt as string | undefined;
      const ts = completedAt ? new Date(completedAt) : u.createdAt ? new Date(u.createdAt) : null;
      return ts && ts > oneDayAgo;
    });

    if (open.length === 0 && recentlyDone.length === 0) continue;

    sections.push({
      accountName: account?.name ?? "Internal / Cross-Account",
      accountSlug: account?.slug ?? "internal",
      openItems: open.map((u) => {
        const meta = u.metadata as Record<string, unknown> | null;
        const created = u.createdAt ? new Date(u.createdAt) : null;
        const isStale = !!(meta?.stale) || (created ? created < threeWeeksAgo : false);
        return { id: u.id, type: u.type, content: u.content, assignee: u.assignee, stale: isStale };
      }),
      recentlyDone: recentlyDone.slice(0, 5).map((u) => ({
        id: u.id,
        content: u.content,
        assignee: u.assignee,
      })),
      stats: { total: units.length, open: open.length, done: done.length, stale: stale.length },
    });
  }

  sections.sort((a, b) => b.stats.open - a.stats.open);
  return sections;
}
