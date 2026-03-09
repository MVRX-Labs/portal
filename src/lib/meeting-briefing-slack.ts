import type { MeetingBriefing } from "@/lib/api-schemas/meeting-briefing";

// ---------------------------------------------------------------------------
// AI talking points generation
// ---------------------------------------------------------------------------

const TALKING_POINTS_SYSTEM_PROMPT = `You are an account intelligence assistant for a B2B agency.
Given context about an upcoming meeting (account details, pending actions, recent engagement, meeting history),
generate 3-5 concise, actionable talking points the account manager should raise.
Each point should be 1-2 sentences max. Focus on what matters: renewals, upsells, unresolved actions, recent activity worth mentioning, and relationship signals.
Return ONLY the numbered talking points, nothing else.`;

function buildTalkingPointsPrompt(briefing: MeetingBriefing): string {
  const lines: string[] = [
    TALKING_POINTS_SYSTEM_PROMPT,
    "",
    `Meeting: ${briefing.eventSummary || "(No title)"}`,
    `Account: ${briefing.account.name}`,
  ];

  if (briefing.account.industry) {
    lines.push(`Industry: ${briefing.account.industry}`);
  }
  if (briefing.account.mrr > 0) {
    lines.push(`MRR: ${briefing.account.mrrCurrency}${briefing.account.mrr}`);
  }
  if (briefing.account.summary) {
    lines.push(`Account Summary: ${briefing.account.summary}`);
  }

  if (briefing.contacts.length > 0) {
    lines.push("", "Attendees:");
    for (const c of briefing.contacts) {
      lines.push(`  - ${c.name} (${c.email}) — ${c.responseStatus || "no RSVP"}`);
    }
  }

  if (briefing.pendingActions.length > 0) {
    lines.push("", "Pending Actions:");
    for (const a of briefing.pendingActions) {
      const due = a.dueDate ? ` (due ${new Date(a.dueDate).toLocaleDateString("en-GB")})` : "";
      lines.push(`  - ${a.title}${due}`);
    }
  }

  if (briefing.recentMeetings.length > 0) {
    lines.push("", "Recent Meetings:");
    for (const m of briefing.recentMeetings) {
      const date = new Date(m.startTime).toLocaleDateString("en-GB");
      lines.push(`  - ${m.summary || "(No title)"} on ${date}`);
    }
  }

  if (briefing.recentEngagement.length > 0) {
    lines.push("", "Recent LinkedIn Activity (last 7 days):");
    for (const e of briefing.recentEngagement) {
      lines.push(`  - ${e.profileName}: ${e.content}`);
    }
  }

  return lines.join("\n");
}

export async function generateTalkingPoints(briefing: MeetingBriefing): Promise<string[]> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const prompt = buildTalkingPointsPrompt(briefing);

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

  if (!output) return [];

  // Parse numbered lines (e.g. "1. ...", "2. ...")
  return output
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// Slack Block Kit message builder
// ---------------------------------------------------------------------------

function responseLabel(status: string | null): string {
  switch (status) {
    case "accepted":
      return "✅ accepted";
    case "tentative":
      return "🤔 tentative";
    case "declined":
      return "❌ declined";
    default:
      return "⏳ awaiting response";
  }
}

export function buildBriefingSlackBlocks(
  briefing: MeetingBriefing,
  talkingPoints: string[] | null,
): { text: string; blocks: Record<string, unknown>[] } {
  const blocks: Record<string, unknown>[] = [];
  const now = new Date();

  const startTimeStr = new Date(briefing.eventStartTime).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  // Header
  const headerText = `:calendar: *Pre-Meeting Briefing — ${briefing.eventSummary || "(No title)"}*`;
  const timeLine = `:clock1: *${startTimeStr} UK*`;
  const calendarLink = briefing.eventHtmlLink ? `  |  <${briefing.eventHtmlLink}|Open in Calendar>` : "";

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `${headerText}\n${timeLine}${calendarLink}` },
  });

  blocks.push({ type: "divider" });

  // Account overview
  const acct = briefing.account;
  const mrrStr = acct.mrr > 0 ? `${acct.mrrCurrency}${acct.mrr.toLocaleString()}/mo` : "—";
  const accountLines = [
    `:office: *${acct.name}*`,
    acct.industry ? `*Industry:* ${acct.industry}` : null,
    `*MRR:* ${mrrStr}`,
    acct.ownerName ? `*Owner:* ${acct.ownerName}` : null,
  ].filter(Boolean);

  if (acct.summary) {
    accountLines.push(`\n>${acct.summary.length > 300 ? acct.summary.slice(0, 300) + "…" : acct.summary}`);
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: accountLines.join("\n") },
  });

  // External attendees
  if (briefing.contacts.length > 0) {
    blocks.push({ type: "divider" });
    const contactLines = briefing.contacts.map(
      (c) => `  • ${c.name} (${c.email}) — ${responseLabel(c.responseStatus)}`,
    );
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:busts_in_silhouette: *Attendees*\n${contactLines.join("\n")}` },
    });
  }

  // Pending actions
  if (briefing.pendingActions.length > 0) {
    blocks.push({ type: "divider" });
    const actionLines = briefing.pendingActions.map((a) => {
      let line = `  • ${a.title}`;
      if (a.dueDate) {
        const due = new Date(a.dueDate);
        const dateStr = due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        const isOverdue = due < now;
        line += isOverdue ? ` — :warning: *overdue (${dateStr})*` : ` — due ${dateStr}`;
      }
      if (a.assigneeName) {
        line += ` _(${a.assigneeName})_`;
      }
      return line;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:clipboard: *Pending Actions*\n${actionLines.join("\n")}` },
    });
  }

  // AI talking points
  if (talkingPoints && talkingPoints.length > 0) {
    blocks.push({ type: "divider" });
    const tpLines = talkingPoints.map((tp, i) => `  ${i + 1}. ${tp}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:bulb: *Suggested Talking Points*\n${tpLines.join("\n")}` },
    });
  }

  // Recent meetings
  if (briefing.recentMeetings.length > 0) {
    blocks.push({ type: "divider" });
    const meetingLines = briefing.recentMeetings.map((m) => {
      const date = new Date(m.startTime).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return `  • ${m.summary || "(No title)"} — ${date}`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:calendar: *Recent Meetings*\n${meetingLines.join("\n")}` },
    });
  }

  // Recent engagement
  if (briefing.recentEngagement.length > 0) {
    blocks.push({ type: "divider" });
    const engLines = briefing.recentEngagement.map(
      (e) => `  • *${e.profileName}:* ${e.content}`,
    );
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:speech_balloon: *Recent LinkedIn Activity*\n${engLines.join("\n")}` },
    });
  }

  // Footer with portal link
  blocks.push({ type: "divider" });
  const portalBase = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "https://portal.mvrxlabs.com";
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${portalBase}/accounts?account=${acct.id}|View ${acct.name} in Portal>`,
      },
    ],
  });

  const fallbackText = `Pre-Meeting Briefing: ${briefing.eventSummary || "(No title)"} at ${startTimeStr} — ${acct.name}`;

  return { text: fallbackText, blocks };
}
