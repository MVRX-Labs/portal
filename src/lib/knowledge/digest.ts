/**
 * Knowledge Hub — Daily digest generator.
 *
 * Generates a structured summary of knowledge units grouped by account,
 * and sends it as a Slack DM to specified recipients.
 *
 * Flow:
 *   1. Load all open units, group by account
 *   2. Identify likely-done items (cross-ref with recent events)
 *   3. Flag stale items (>3 weeks, no activity)
 *   4. Format as Slack blocks
 *   5. DM to Tarun + Nitanshu
 */

import { db } from "@/lib/db";
import { knowledgeUnits, accounts } from "@/lib/schema";
import { eq, desc, or, and, gt } from "drizzle-orm";
import { sendKnowledgeSlackDM } from "@/lib/slack";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

// Recipients for daily digest DMs
const DIGEST_RECIPIENTS = [
  "U0ACUKDKYGK", // Tarun Odedra
  "U0AJ4E662G1", // Nitanshu
];

interface DigestSection {
  accountName: string;
  accountSlug: string;
  openItems: Array<{ id: string; type: string; content: string; assignee: string | null; stale: boolean }>;
  recentlyDone: Array<{ id: string; content: string; assignee: string | null }>;
  stats: { total: number; open: number; done: number; stale: number };
}

/**
 * Generate and send the daily digest.
 */
export async function generateAndSendDigest(logger: Logger): Promise<{ sections: number; messagesSent: number }> {
  const sections = await buildDigestSections(logger);

  if (sections.length === 0) {
    logger.info("No accounts with open items — skipping digest");
    return { sections: 0, messagesSent: 0 };
  }

  const blocks = formatDigestBlocks(sections);
  let sent = 0;

  for (const userId of DIGEST_RECIPIENTS) {
    try {
      await sendKnowledgeSlackDM(userId, blocks);
      sent++;
      logger.info(`Digest sent to ${userId}`);
    } catch (err) {
      logger.error(`Failed to send digest to ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { sections: sections.length, messagesSent: sent };
}

async function buildDigestSections(logger: Logger): Promise<DigestSection[]> {
  // Load only open units + recently done (last 48h) — avoids full table scan
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

  // Get account names
  const accountRows = await db.select({ id: accounts.id, name: accounts.name, slug: accounts.slug }).from(accounts);
  const accountMap = new Map(accountRows.map((a) => [a.id, a]));

  // Group by account
  const byAccount = new Map<string | null, typeof allUnits>();
  for (const u of allUnits) {
    const key = u.accountId;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(u);
  }

  const sections: DigestSection[] = [];

  for (const [accountId, units] of byAccount) {
    const account = accountId ? accountMap.get(accountId) : null;
    const open = units.filter((u) => u.status === "open");
    const done = units.filter((u) => u.status === "done");
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const stale = open.filter((u) => {
      const meta = u.metadata as Record<string, unknown> | null;
      // Stale if: metadata.stale was set at extraction (dueDate-based),
      // OR the unit was created >3 weeks ago and is still open
      if (meta?.stale) return true;
      const created = u.createdAt ? new Date(u.createdAt) : null;
      return created && created < threeWeeksAgo;
    });

    // Recently done = done items updated (marked done) in the last 24h.
    // We check metadata.completedAt if set (by PATCH endpoint), otherwise fall back to createdAt.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
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

  // Sort by open items count (most active first)
  sections.sort((a, b) => b.stats.open - a.stats.open);
  return sections;
}

function formatDigestBlocks(sections: DigestSection[]): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "📋 Knowledge Hub — Daily Digest" },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Generated ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}` }],
    },
    { type: "divider" },
  ];

  for (const section of sections) {
    // Account header
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${section.accountName}* — ${section.stats.open} open, ${section.stats.done} done${section.stats.stale > 0 ? `, ⚠️ ${section.stats.stale} stale` : ""}`,
      },
    });

    // Open items (grouped by assignee)
    const byAssignee = new Map<string, typeof section.openItems>();
    for (const item of section.openItems) {
      const key = item.assignee || "(unassigned)";
      if (!byAssignee.has(key)) byAssignee.set(key, []);
      byAssignee.get(key)!.push(item);
    }

    for (const [assignee, items] of byAssignee) {
      const itemLines = items.slice(0, 5).map((i) => {
        const prefix = i.stale ? "⚠️" : "⬜";
        const typeTag = i.type === "action_item" ? "" : ` _[${i.type}]_`;
        return `${prefix} ${i.content.slice(0, 120)}${i.content.length > 120 ? "…" : ""}${typeTag}`;
      });
      if (items.length > 5) itemLines.push(`_...and ${items.length - 5} more_`);

      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${assignee}:*\n${itemLines.join("\n")}` },
      });
    }

    // Recently done
    if (section.recentlyDone.length > 0) {
      const doneLines = section.recentlyDone.map((i) =>
        `✅ ${i.content.slice(0, 100)}${i.content.length > 100 ? "…" : ""}`,
      );
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Recently completed:*\n${doneLines.join("\n")}` },
      });
    }

    blocks.push({ type: "divider" });
  }

  // Footer with instructions
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: "Reply with item corrections: e.g. _\"close: Charlie to send office video\"_ or _\"stale: credentials request\"_",
    }],
  });

  return blocks;
}

