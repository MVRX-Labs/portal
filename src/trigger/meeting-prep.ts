import { task, logger } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents, calendarEventAccounts, calendarEventContacts } from "@/lib/schema";
import { gatherMeetingContext, type MeetingContext } from "@/lib/meeting-prep";
import { sendSlackThreadReply, sendSlackNotification } from "@/lib/slack";
import type { MeetingPrepPayload } from "@/lib/api-schemas/meeting-prep";

export const meetingPrepTask = task({
  id: "meeting-prep",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: MeetingPrepPayload, { ctx }) => {
    const { eventId, slackUserId, notificationTs } = payload;

    try {
      // Load the event
      const [event] = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, eventId))
        .limit(1);

      if (!event) {
        logger.warn(`Event ${eventId} not found, skipping meeting prep`);
        return { skipped: true, reason: "event_not_found" };
      }

      // Resolve linked account & contact IDs
      const linkedAccounts = await db
        .select({ accountId: calendarEventAccounts.accountId })
        .from(calendarEventAccounts)
        .where(eq(calendarEventAccounts.eventId, eventId));

      const linkedContacts = await db
        .select({ contactId: calendarEventContacts.contactId })
        .from(calendarEventContacts)
        .where(eq(calendarEventContacts.eventId, eventId));

      const accountIds = linkedAccounts.map((a) => a.accountId);
      const contactIds = linkedContacts.map((c) => c.contactId);

      if (accountIds.length === 0) {
        logger.info(`No linked accounts for event ${eventId}, skipping prep`);
        return { skipped: true, reason: "no_linked_accounts" };
      }

      logger.info(`Gathering context for ${accountIds.length} accounts, ${contactIds.length} contacts`);
      const context = await gatherMeetingContext(accountIds, contactIds);

      const prompt = buildPrepPrompt(event.summary || "(No title)", context);

      logger.info("Generating meeting prep briefing via Claude");
      const briefing = await generateBriefing(prompt);

      if (!briefing) {
        logger.warn("Claude returned empty briefing");
        return { skipped: true, reason: "empty_briefing" };
      }

      // Build Block Kit message
      const blocks = buildBriefingBlocks(briefing);
      const fallbackText = `📋 Meeting Prep: ${event.summary || "(No title)"}`;

      await sendSlackThreadReply(slackUserId, notificationTs, fallbackText, blocks);

      logger.info(`Meeting prep briefing sent as thread reply for event ${eventId}`);
      return { success: true, eventId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Meeting prep failed", { error: errorMessage, eventId });

      await sendSlackNotification({
        tool: "meeting-prep",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});

function buildPrepPrompt(meetingTitle: string, ctx: MeetingContext): string {
  const sections: string[] = [];

  sections.push(`Meeting title: "${meetingTitle}"`);

  if (ctx.accounts.length > 0) {
    const lines = ctx.accounts.map((a) => {
      const mrr = a.mrr > 0 ? ` | MRR: ${a.mrrCurrency}${a.mrr}` : "";
      const industry = a.industry ? ` | Industry: ${a.industry}` : "";
      return `- ${a.name}${industry}${mrr}`;
    });
    sections.push(`Accounts:\n${lines.join("\n")}`);
  }

  if (ctx.contacts.length > 0) {
    const lines = ctx.contacts.map((c) => {
      const notes = c.notes ? ` — Notes: ${c.notes}` : "";
      return `- ${c.name}${notes}`;
    });
    sections.push(`Contacts:\n${lines.join("\n")}`);
  }

  if (ctx.pendingActions.length > 0) {
    const lines = ctx.pendingActions.map(
      (a) => `- [${a.accountName}] ${a.title}${a.description ? `: ${a.description}` : ""}`,
    );
    sections.push(`Pending Actions:\n${lines.join("\n")}`);
  }

  if (ctx.recentToolRuns.length > 0) {
    const lines = ctx.recentToolRuns.map(
      (r) => `- [${r.accountName}] ${r.tool} — ${r.status} (${r.createdAt.toLocaleDateString()})`,
    );
    sections.push(`Recent Tool Runs (last 30 days):\n${lines.join("\n")}`);
  }

  if (ctx.recentEngagement.length > 0) {
    const lines = ctx.recentEngagement.map((e) => {
      const comment = e.agentComment ? ` | AI comment: "${e.agentComment}"` : "";
      return `- ${e.profileName}: "${e.postContent}" [${e.engagementStatus}]${comment}`;
    });
    sections.push(`Recent Engagement Bot Activity:\n${lines.join("\n")}`);
  }

  if (ctx.recentLeads.length > 0) {
    const lines = ctx.recentLeads.map((l) => {
      const name = [l.firstName, l.lastName].filter(Boolean).join(" ");
      const company = l.company ? ` at ${l.company}` : "";
      return `- ${name}${company} [${l.accountName}]`;
    });
    sections.push(`New Leads Discovered (last 14 days):\n${lines.join("\n")}`);
  }

  if (ctx.pastMeetings.length > 0) {
    const lines = ctx.pastMeetings.map(
      (m) => `- "${m.summary || "(No title)"}" on ${m.startTime.toLocaleDateString()} (${m.accountNames.join(", ")})`,
    );
    sections.push(`Past Meetings with These Accounts:\n${lines.join("\n")}`);
  }

  if (ctx.latestAnalytics.length > 0) {
    const lines = ctx.latestAnalytics.map(
      (a) =>
        `- [${a.accountName}] ${a.reportType} report (${a.periodStart.toLocaleDateString()} – ${a.periodEnd.toLocaleDateString()})`,
    );
    sections.push(`Latest Analytics Reports:\n${lines.join("\n")}`);
  }

  return `You are a meeting prep assistant for an agency that manages LinkedIn presence and engagement for clients.

Given the following context about an upcoming meeting, produce a concise meeting prep briefing as 3-5 bullet points. Each bullet should be actionable and specific — reference actual data from the context. Focus on what the person needs to know and do before this meeting.

If there are pending actions, flag them. If there's recent engagement activity or new leads, highlight the most relevant. If past meetings exist, note any patterns or follow-ups.

Keep each bullet to 1-2 sentences. Be direct and specific — no generic advice.

---
${sections.join("\n\n")}
---

Respond with ONLY the bullet points, one per line, each starting with "• ". No preamble, no summary header.`;
}

async function generateBriefing(prompt: string): Promise<string> {
  let output = "";
  for await (const message of query({
    prompt,
    options: {
      model: "claude-haiku-4-20250414",
      maxTurns: 1,
      allowedTools: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          output += block.text;
        }
      }
    }
  }
  return output.trim();
}

function buildBriefingBlocks(briefing: string): Record<string, unknown>[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:brain: *Meeting Prep Briefing*`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: briefing,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Auto-generated by MVRX Meeting Prep • Powered by Claude_",
        },
      ],
    },
  ];
}
