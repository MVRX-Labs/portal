import { task, logger } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { meetingPreps } from "@/lib/schema";
import { aggregateAccountContext, type MeetingContext } from "@/lib/meeting-prep";
import { sendSlackNotification, sendSlackDM, resolveSlackUserId } from "@/lib/slack";
import { MODEL_MAP, extractJSON } from "@/lib/audit-utils";

interface MeetingPrepPayload {
  eventId: string;
  accountId: string;
  userId: string;
  userEmail: string;
}

interface Briefing {
  account_summary: string;
  key_contacts: Array<{ name: string; role?: string; notes: string }>;
  recent_activity_highlights: string[];
  talking_points: string[];
  suggested_agenda: string[];
  risk_flags: string[];
}

function buildPrompt(ctx: MeetingContext): string {
  const mrrDisplay =
    ctx.account.mrr > 0
      ? `${ctx.account.mrrCurrency}${(ctx.account.mrr / 100).toLocaleString()}/mo`
      : "No MRR recorded";

  const contactList = ctx.attendingContacts.length > 0
    ? ctx.attendingContacts
        .map((c) => `- ${c.name} (${c.attendeeEmail})${c.linkedinUrl ? ` — LinkedIn: ${c.linkedinUrl}` : ""}`)
        .join("\n")
    : "No known contacts attending.";

  const actionList = ctx.pendingActions.length > 0
    ? ctx.pendingActions.map((a) => `- ${a.title}${a.dueDate ? ` (due: ${a.dueDate.toISOString().split("T")[0]})` : ""}`).join("\n")
    : "No pending actions.";

  const leadList = ctx.recentLeads.length > 0
    ? ctx.recentLeads
        .map((l) => `- ${l.firstName} ${l.lastName || ""} — ${l.headline || "No headline"} at ${l.company || "Unknown"}`)
        .join("\n")
    : "No recent leads.";

  const engagementList = ctx.recentEngagement.length > 0
    ? ctx.recentEngagement
        .map((e) => `- ${e.profileName}: "${e.content.slice(0, 150)}..." (${e.likesCount} likes, ${e.commentsCount} comments)`)
        .join("\n")
    : "No recent engagement activity.";

  const toolRunList = ctx.recentToolRuns.length > 0
    ? ctx.recentToolRuns.map((t) => `- ${t.tool} (${t.status}, ${t.createdAt.toISOString().split("T")[0]})`).join("\n")
    : "No recent tool runs.";

  return `You are a meeting preparation assistant. Generate a structured briefing for an upcoming meeting.

ACCOUNT DETAILS:
- Name: ${ctx.account.name}
- Industry: ${ctx.account.industry || "Unknown"}
- Website: ${ctx.account.website || "N/A"}
- MRR: ${mrrDisplay}
- Account Summary: ${ctx.account.summary || "No summary available."}

MEETING DETAILS:
- Title: ${ctx.event.summary || "Untitled meeting"}
- Time: ${ctx.event.startTime.toISOString()}
- Description: ${ctx.event.description?.slice(0, 500) || "No description."}

ATTENDING CONTACTS:
${contactList}

PENDING ACCOUNT ACTIONS:
${actionList}

RECENT LEADS (last 14 days):
${leadList}

RECENT LINKEDIN ENGAGEMENT (last 7 days):
${engagementList}

RECENT TOOL RUNS (last 30 days):
${toolRunList}

Based on all the above context, generate a meeting prep briefing as a JSON object with these fields:
{
  "account_summary": "A 2-3 sentence executive summary of the account state and relationship",
  "key_contacts": [{"name": "...", "role": "...", "notes": "Relevant context about this person"}],
  "recent_activity_highlights": ["Highlight 1", "Highlight 2", ...],
  "talking_points": ["Point 1", "Point 2", ...],
  "suggested_agenda": ["Agenda item 1", "Agenda item 2", ...],
  "risk_flags": ["Risk or concern 1", ...]
}

Requirements:
- talking_points: 3-5 specific, actionable points tailored to this account's context
- suggested_agenda: 3-5 structured agenda items based on the meeting context and pending actions
- key_contacts: Include all attending contacts with notes on what you know about them
- recent_activity_highlights: Summarize notable recent engagement, leads, or tool activity
- risk_flags: Note any concerns (overdue actions, declining engagement, no recent contact, etc.). Empty array if none.
- Be specific and reference actual data points. Avoid generic advice.

Return ONLY the JSON object, no other text.`;
}

function buildSlackBlocks(briefing: Briefing, accountName: string, eventSummary: string, eventId: string): Record<string, unknown>[] {
  const talkingPointsText = briefing.talking_points.map((tp, i) => `${i + 1}. ${tp}`).join("\n");
  const contactsText = briefing.key_contacts
    .map((c) => `• *${c.name}*${c.role ? ` (${c.role})` : ""} — ${c.notes}`)
    .join("\n");
  const riskText = briefing.risk_flags.length > 0
    ? briefing.risk_flags.map((r) => `• :warning: ${r}`).join("\n")
    : "_No risk flags identified._";

  const portalUrl = `${process.env.NEXTAUTH_URL || "https://portal.mvrx.co"}/meetings/${eventId}/prep`;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:brain: *Meeting Prep: ${eventSummary || "Upcoming Meeting"}*\n_Account: ${accountName}_`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Summary*\n${briefing.account_summary}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Talking Points*\n${talkingPointsText}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Key Contacts*\n${contactsText || "_No contacts identified._"}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Risk Flags*\n${riskText}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: ":memo: View Full Briefing" },
          url: portalUrl,
          action_id: "view_meeting_prep",
        },
      ],
    },
  ];
}

export const meetingPrepGeneratorTask = task({
  id: "meeting-prep-generator",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: MeetingPrepPayload) => {
    const { eventId, accountId, userId, userEmail } = payload;
    logger.info("Starting meeting prep generation", { eventId, accountId, userId });

    // Upsert a meeting prep record
    const [existing] = await db
      .select({ id: meetingPreps.id })
      .from(meetingPreps)
      .where(and(eq(meetingPreps.eventId, eventId), eq(meetingPreps.accountId, accountId)))
      .limit(1);

    let prepId: string;
    if (existing) {
      prepId = existing.id;
      await db.update(meetingPreps).set({ status: "generating", updatedAt: new Date() }).where(eq(meetingPreps.id, prepId));
    } else {
      const [row] = await db
        .insert(meetingPreps)
        .values({ eventId, accountId, userId, status: "generating" })
        .returning({ id: meetingPreps.id });
      prepId = row.id;
    }

    try {
      const ctx = await aggregateAccountContext(accountId, eventId);
      logger.info("Aggregated meeting context", {
        contacts: ctx.attendingContacts.length,
        actions: ctx.pendingActions.length,
        leads: ctx.recentLeads.length,
        engagement: ctx.recentEngagement.length,
        toolRuns: ctx.recentToolRuns.length,
      });

      let output = "";
      for await (const message of query({
        prompt: buildPrompt(ctx),
        options: {
          model: MODEL_MAP.sonnet,
          allowedTools: [],
          maxTurns: 1,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          persistSession: false,
        },
      })) {
        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            logger.info(`Claude finished: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`);
          } else {
            const msg = message as any;
            const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
            throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
          }
        }
      }

      const jsonStr = extractJSON(output);
      const briefing: Briefing = JSON.parse(jsonStr);

      await db.update(meetingPreps).set({
        briefingJson: briefing,
        status: "ready",
        updatedAt: new Date(),
      }).where(eq(meetingPreps.id, prepId));

      logger.info("Meeting prep saved", { prepId, talkingPoints: briefing.talking_points.length });

      // Send Slack DM with the briefing
      const slackUserId = await resolveSlackUserId(userId, userEmail);
      if (slackUserId) {
        const blocks = buildSlackBlocks(briefing, ctx.account.name, ctx.event.summary || "", eventId);
        const fallback = `Meeting Prep ready for ${ctx.event.summary || "upcoming meeting"} (${ctx.account.name})`;
        await sendSlackDM(slackUserId, fallback, blocks);
        logger.info("Slack DM sent with meeting prep briefing");
      } else {
        logger.warn("Could not resolve Slack user for meeting prep DM", { userId, userEmail });
      }

      return { success: true, prepId };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Meeting prep generation failed: ${errorMessage}`, { prepId, eventId });

      await db.update(meetingPreps).set({
        status: "failed",
        updatedAt: new Date(),
      }).where(eq(meetingPreps.id, prepId)).catch(() => {});

      await sendSlackNotification({
        tool: "meeting-prep-generator",
        userName: "trigger-task",
        error: errorMessage,
        runId: prepId,
      }).catch(() => {});

      throw err;
    }
  },
});
