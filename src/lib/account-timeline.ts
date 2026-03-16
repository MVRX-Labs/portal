import { db } from "@/lib/db";
import {
  calendarEvents, calendarEventAccounts, knowledgeEvents, knowledgeChannels,
  linkedinPosts, linkedinProfiles, leads, accountActions, toolRuns,
} from "@/lib/schema";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import type { TimelineEvent } from "@/lib/api-schemas/timeline";

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function attendeeNames(
  attendees: Array<{ email: string; displayName?: string; self?: boolean }>
): string[] {
  return attendees.filter((a) => !a.self).map((a) => a.displayName || a.email).slice(0, 5);
}

export async function getAccountTimeline(
  accountId: string,
  limit: number,
  before?: Date
): Promise<{ events: TimelineEvent[]; nextCursor: string | null }> {
  const perSource = limit + 5;
  const [meetings, knowledge, posts, leadRows, actions, runs] = await Promise.all([
    fetchMeetings(accountId, perSource, before),
    fetchKnowledgeEvents(accountId, perSource, before),
    fetchLinkedinPosts(accountId, perSource, before),
    fetchLeads(accountId, perSource, before),
    fetchActions(accountId, perSource, before),
    fetchToolRuns(accountId, perSource, before),
  ]);

  const all: TimelineEvent[] = [...meetings, ...knowledge, ...posts, ...leadRows, ...actions, ...runs];
  all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const page = all.slice(0, limit);
  const nextCursor = page.length === limit ? page[page.length - 1].timestamp : null;
  return { events: page, nextCursor };
}

async function fetchMeetings(accountId: string, limit: number, before?: Date): Promise<TimelineEvent[]> {
  const conditions = [eq(calendarEventAccounts.accountId, accountId)];
  if (before) conditions.push(lt(calendarEvents.startTime, before));

  const rows = await db
    .select({
      id: calendarEvents.id, summary: calendarEvents.summary,
      startTime: calendarEvents.startTime, attendees: calendarEvents.attendees,
      htmlLink: calendarEvents.htmlLink,
    })
    .from(calendarEventAccounts)
    .innerJoin(calendarEvents, eq(calendarEventAccounts.eventId, calendarEvents.id))
    .where(and(...conditions))
    .orderBy(desc(calendarEvents.startTime))
    .limit(limit);

  return rows.map((r) => {
    const names = attendeeNames(r.attendees ?? []);
    const title = r.summary || "Untitled meeting";
    const who = names.length > 0 ? ` with ${names.join(", ")}` : "";
    return {
      id: r.id, type: "meeting" as const, timestamp: r.startTime.toISOString(),
      summary: `${title}${who}`, title: r.summary, attendees: names, htmlLink: r.htmlLink,
    };
  });
}

async function fetchKnowledgeEvents(accountId: string, limit: number, before?: Date): Promise<TimelineEvent[]> {
  const conditions = [eq(knowledgeEvents.accountId, accountId)];
  if (before) conditions.push(lt(knowledgeEvents.messageAt, before));

  const rows = await db
    .select({
      id: knowledgeEvents.id, source: knowledgeEvents.source,
      authorName: knowledgeEvents.authorName, rawContent: knowledgeEvents.rawContent,
      messageAt: knowledgeEvents.messageAt, channelName: knowledgeChannels.slackChannelName,
    })
    .from(knowledgeEvents)
    .innerJoin(knowledgeChannels, eq(knowledgeEvents.channelId, knowledgeChannels.id))
    .where(and(...conditions))
    .orderBy(desc(knowledgeEvents.messageAt))
    .limit(limit);

  return rows.map((r) => {
    const preview = truncate(r.rawContent, 120);
    const author = r.authorName || "Unknown";
    return {
      id: r.id, type: "knowledge_event" as const, timestamp: r.messageAt.toISOString(),
      summary: `${author} in #${r.channelName || "channel"}: ${preview}`,
      source: r.source, authorName: r.authorName, contentPreview: preview, channelName: r.channelName,
    };
  });
}

async function fetchLinkedinPosts(accountId: string, limit: number, before?: Date): Promise<TimelineEvent[]> {
  const conditions = [eq(linkedinPosts.accountId, accountId)];
  if (before) {
    conditions.push(lt(sql`coalesce(${linkedinPosts.postedAt}, ${linkedinPosts.discoveredAt})`, before));
  }

  const rows = await db
    .select({
      id: linkedinPosts.id, content: linkedinPosts.content, postUrl: linkedinPosts.postUrl,
      likesCount: linkedinPosts.likesCount, commentsCount: linkedinPosts.commentsCount,
      repostsCount: linkedinPosts.repostsCount, postedAt: linkedinPosts.postedAt,
      discoveredAt: linkedinPosts.discoveredAt, profileName: linkedinProfiles.displayName,
    })
    .from(linkedinPosts)
    .innerJoin(linkedinProfiles, eq(linkedinPosts.profileId, linkedinProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${linkedinPosts.postedAt}, ${linkedinPosts.discoveredAt})`))
    .limit(limit);

  return rows.map((r) => {
    const snippet = truncate(r.content, 100);
    const ts = r.postedAt || r.discoveredAt;
    const name = r.profileName || "Unknown";
    return {
      id: r.id, type: "linkedin_post" as const, timestamp: ts.toISOString(),
      summary: `${name} posted: ${snippet}`, postUrl: r.postUrl, contentSnippet: snippet,
      likesCount: r.likesCount, commentsCount: r.commentsCount, repostsCount: r.repostsCount,
      profileName: name,
    };
  });
}

async function fetchLeads(accountId: string, limit: number, before?: Date): Promise<TimelineEvent[]> {
  const conditions = [eq(leads.accountId, accountId)];
  if (before) conditions.push(lt(leads.firstSeenAt, before));

  const rows = await db
    .select({
      id: leads.id, firstName: leads.firstName, lastName: leads.lastName,
      headline: leads.headline, linkedinUrl: leads.linkedinUrl, firstSeenAt: leads.firstSeenAt,
    })
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.firstSeenAt))
    .limit(limit);

  return rows.map((r) => {
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ");
    const hl = r.headline ? ` - ${truncate(r.headline, 60)}` : "";
    return {
      id: r.id, type: "lead" as const, timestamp: r.firstSeenAt.toISOString(),
      summary: `New lead: ${name}${hl}`,
      firstName: r.firstName, lastName: r.lastName, headline: r.headline, linkedinUrl: r.linkedinUrl,
    };
  });
}

async function fetchActions(accountId: string, limit: number, before?: Date): Promise<TimelineEvent[]> {
  const conditions = [eq(accountActions.accountId, accountId)];
  if (before) conditions.push(lt(accountActions.createdAt, before));

  const rows = await db
    .select({
      id: accountActions.id, title: accountActions.title, status: accountActions.status,
      dueDate: accountActions.dueDate, createdAt: accountActions.createdAt,
    })
    .from(accountActions)
    .where(and(...conditions))
    .orderBy(desc(accountActions.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const due = r.dueDate ? ` (due ${r.dueDate.toISOString().slice(0, 10)})` : "";
    return {
      id: r.id, type: "action" as const, timestamp: r.createdAt.toISOString(),
      summary: `Action: ${r.title} [${r.status}]${due}`,
      title: r.title, status: r.status, dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    };
  });
}

async function fetchToolRuns(accountId: string, limit: number, before?: Date): Promise<TimelineEvent[]> {
  const conditions = [eq(toolRuns.accountId, accountId)];
  if (before) conditions.push(lt(toolRuns.createdAt, before));

  const rows = await db
    .select({
      id: toolRuns.id, tool: toolRuns.tool, status: toolRuns.status,
      outputUrl: toolRuns.outputUrl, createdAt: toolRuns.createdAt,
    })
    .from(toolRuns)
    .where(and(...conditions))
    .orderBy(desc(toolRuns.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id, type: "tool_run" as const, timestamp: r.createdAt.toISOString(),
    summary: `Tool run: ${r.tool} [${r.status}]`,
    tool: r.tool, status: r.status, outputUrl: r.outputUrl,
  }));
}
