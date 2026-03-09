import { db } from "@/lib/db";
import {
  accounts,
  accountActions,
  engagementPosts,
  engagementProfiles,
  leads,
  analyticsReports,
  calendarEvents,
  calendarEventAccounts,
} from "@/lib/schema";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { MODEL_MAP } from "@/lib/audit-utils";

export interface AccountMeetingContext {
  account: {
    id: string;
    name: string;
    summary: string | null;
    mrr: number;
    mrrCurrency: string;
    industry: string | null;
  };
  pendingActions: Array<{ title: string; description: string | null; dueDate: Date | null }>;
  recentEngagement: Array<{
    profileName: string;
    postContent: string;
    engagedAt: Date | null;
  }>;
  recentLeads: Array<{
    firstName: string;
    lastName: string | null;
    headline: string | null;
    company: string | null;
  }>;
  latestReport: {
    reportType: string;
    periodStart: Date;
    periodEnd: Date;
    reportData: Record<string, unknown>;
  } | null;
  previousMeetings: Array<{
    summary: string | null;
    startTime: Date;
  }>;
}

export async function gatherAccountContext(accountId: string): Promise<AccountMeetingContext> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // (a) Account details
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      summary: accounts.summary,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
      industry: accounts.industry,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  // (b) Pending actions
  const pendingActions = await db
    .select({
      title: accountActions.title,
      description: accountActions.description,
      dueDate: accountActions.dueDate,
    })
    .from(accountActions)
    .where(and(eq(accountActions.accountId, accountId), eq(accountActions.status, "pending")))
    .orderBy(accountActions.createdAt)
    .limit(10);

  // (c) Recent engagement activity (last 14 days)
  const recentEngagement = await db
    .select({
      profileName: engagementProfiles.displayName,
      postContent: engagementPosts.content,
      engagedAt: engagementPosts.engagedAt,
    })
    .from(engagementPosts)
    .innerJoin(engagementProfiles, eq(engagementPosts.profileId, engagementProfiles.id))
    .where(
      and(
        eq(engagementProfiles.accountId, accountId),
        gte(engagementPosts.engagedAt, fourteenDaysAgo)
      )
    )
    .orderBy(desc(engagementPosts.engagedAt))
    .limit(10);

  // (d) Recent leads (last 14 days)
  const recentLeads = await db
    .select({
      firstName: leads.firstName,
      lastName: leads.lastName,
      headline: leads.headline,
      company: leads.company,
    })
    .from(leads)
    .where(and(eq(leads.accountId, accountId), gte(leads.createdAt, fourteenDaysAgo)))
    .orderBy(desc(leads.createdAt))
    .limit(10);

  // (e) Latest analytics report
  const [latestReport] = await db
    .select({
      reportType: analyticsReports.reportType,
      periodStart: analyticsReports.periodStart,
      periodEnd: analyticsReports.periodEnd,
      reportData: analyticsReports.reportData,
    })
    .from(analyticsReports)
    .where(eq(analyticsReports.accountId, accountId))
    .orderBy(desc(analyticsReports.createdAt))
    .limit(1);

  // (f) Last 3 completed calendar events for this account
  const previousMeetings = await db
    .select({
      summary: calendarEvents.summary,
      startTime: calendarEvents.startTime,
    })
    .from(calendarEventAccounts)
    .innerJoin(calendarEvents, eq(calendarEventAccounts.eventId, calendarEvents.id))
    .where(and(eq(calendarEventAccounts.accountId, accountId), lt(calendarEvents.startTime, now)))
    .orderBy(desc(calendarEvents.startTime))
    .limit(3);

  return {
    account,
    pendingActions,
    recentEngagement,
    recentLeads,
    latestReport: latestReport ?? null,
    previousMeetings,
  };
}

function formatContextForPrompt(contexts: AccountMeetingContext[]): string {
  return contexts
    .map((ctx) => {
      const lines: string[] = [];
      const a = ctx.account;
      lines.push(`## Account: ${a.name}`);
      if (a.industry) lines.push(`Industry: ${a.industry}`);
      if (a.mrr > 0) lines.push(`MRR: ${a.mrrCurrency}${a.mrr}`);
      if (a.summary) lines.push(`Summary: ${a.summary}`);

      if (ctx.pendingActions.length > 0) {
        lines.push(`\nPending Action Items:`);
        ctx.pendingActions.forEach((action) => {
          const due = action.dueDate ? ` (due: ${action.dueDate.toISOString().split("T")[0]})` : "";
          lines.push(`- ${action.title}${due}`);
        });
      }

      if (ctx.recentEngagement.length > 0) {
        lines.push(`\nRecent Engagement Activity (last 14 days):`);
        ctx.recentEngagement.forEach((e) => {
          const snippet = e.postContent.length > 100 ? e.postContent.slice(0, 100) + "..." : e.postContent;
          lines.push(`- ${e.profileName}: "${snippet}"`);
        });
      }

      if (ctx.recentLeads.length > 0) {
        lines.push(`\nNewly Discovered Leads (last 14 days):`);
        ctx.recentLeads.forEach((l) => {
          const name = [l.firstName, l.lastName].filter(Boolean).join(" ");
          const detail = [l.headline, l.company].filter(Boolean).join(" at ");
          lines.push(`- ${name}${detail ? ` — ${detail}` : ""}`);
        });
      }

      if (ctx.latestReport) {
        const r = ctx.latestReport;
        const period = `${r.periodStart.toISOString().split("T")[0]} to ${r.periodEnd.toISOString().split("T")[0]}`;
        lines.push(`\nLatest Analytics Report (${r.reportType}, ${period}):`);
        lines.push(JSON.stringify(r.reportData, null, 2).slice(0, 500));
      }

      if (ctx.previousMeetings.length > 0) {
        lines.push(`\nPrevious Meetings:`);
        ctx.previousMeetings.forEach((m) => {
          const date = m.startTime.toISOString().split("T")[0];
          lines.push(`- ${date}: ${m.summary || "(no title)"}`);
        });
      }

      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

export async function generateBriefing(
  eventSummary: string | null,
  attendeeNames: string[],
  contexts: AccountMeetingContext[]
): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const contextText = formatContextForPrompt(contexts);
  const attendeesText = attendeeNames.length > 0 ? attendeeNames.join(", ") : "No matched contacts";

  const prompt = `You are a meeting preparation assistant. Generate a concise meeting prep briefing.

Meeting: ${eventSummary || "(No title)"}
Attendees: ${attendeesText}

Account Context:
${contextText}

Based on the above context, generate:
1. 3-5 concise talking points (each 1-2 sentences max) that would be most valuable for this meeting
2. A recommended agenda with 3-4 items

Format your response exactly like this (use plain text, no markdown headers):
TALKING POINTS:
- [point 1]
- [point 2]
- [point 3]

RECOMMENDED AGENDA:
1. [agenda item 1]
2. [agenda item 2]
3. [agenda item 3]

Be specific and actionable. Reference actual data from the context (action items, leads, engagement activity, metrics). Do not be generic.`;

  let output = "";
  for await (const message of query({
    prompt,
    options: {
      model: MODEL_MAP.haiku,
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

  if (!output) throw new Error("No briefing generated from LLM");
  return output;
}
