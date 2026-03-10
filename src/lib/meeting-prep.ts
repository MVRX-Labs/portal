import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  accountActions,
  toolRuns,
  engagementProfiles,
  engagementPosts,
  leads,
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
  managedProfiles,
  managedPostSnapshots,
  analyticsReports,
} from "@/lib/schema";
import { eq, and, gte, ne, desc, inArray, lt } from "drizzle-orm";

export interface MeetingContext {
  accounts: Array<{ id: string; name: string; industry: string | null; mrr: number; mrrCurrency: string }>;
  contacts: Array<{ id: string; name: string; accountId: string; notes: string | null }>;
  pendingActions: Array<{ title: string; description: string | null; status: string; accountName: string }>;
  recentToolRuns: Array<{ tool: string; status: string; createdAt: Date; accountName: string }>;
  recentEngagement: Array<{
    profileName: string;
    postContent: string;
    engagementStatus: string;
    agentComment: string | null;
  }>;
  recentLeads: Array<{ firstName: string; lastName: string | null; company: string | null; accountName: string }>;
  pastMeetings: Array<{ summary: string | null; startTime: Date; accountNames: string[] }>;
  latestAnalytics: Array<{
    accountName: string;
    reportType: string;
    periodStart: Date;
    periodEnd: Date;
  }>;
}

export async function gatherMeetingContext(
  accountIds: string[],
  contactIds: string[],
): Promise<MeetingContext> {
  if (accountIds.length === 0 && contactIds.length === 0) {
    return emptyContext();
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Gather all data in parallel for speed
  const [
    accountRows,
    contactRows,
    actionRows,
    toolRunRows,
    engagementRows,
    leadRows,
    pastMeetingRows,
    analyticsRows,
  ] = await Promise.all([
    fetchAccounts(accountIds),
    fetchContacts(contactIds),
    fetchPendingActions(accountIds),
    fetchRecentToolRuns(accountIds, thirtyDaysAgo),
    fetchRecentEngagement(accountIds),
    fetchRecentLeads(accountIds, fourteenDaysAgo),
    fetchPastMeetings(accountIds, now),
    fetchLatestAnalytics(accountIds),
  ]);

  return {
    accounts: accountRows,
    contacts: contactRows,
    pendingActions: actionRows,
    recentToolRuns: toolRunRows,
    recentEngagement: engagementRows,
    recentLeads: leadRows,
    pastMeetings: pastMeetingRows,
    latestAnalytics: analyticsRows,
  };
}

function emptyContext(): MeetingContext {
  return {
    accounts: [],
    contacts: [],
    pendingActions: [],
    recentToolRuns: [],
    recentEngagement: [],
    recentLeads: [],
    pastMeetings: [],
    latestAnalytics: [],
  };
}

async function fetchAccounts(accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      industry: accounts.industry,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
    })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));
}

async function fetchContacts(contactIds: string[]) {
  if (contactIds.length === 0) return [];
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      accountId: contacts.accountId,
      notes: contacts.notes,
    })
    .from(contacts)
    .where(inArray(contacts.id, contactIds));
}

async function fetchPendingActions(accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return db
    .select({
      title: accountActions.title,
      description: accountActions.description,
      status: accountActions.status,
      accountName: accounts.name,
    })
    .from(accountActions)
    .innerJoin(accounts, eq(accountActions.accountId, accounts.id))
    .where(
      and(inArray(accountActions.accountId, accountIds), eq(accountActions.status, "pending")),
    )
    .orderBy(desc(accountActions.createdAt))
    .limit(10);
}

async function fetchRecentToolRuns(accountIds: string[], since: Date) {
  if (accountIds.length === 0) return [];
  return db
    .select({
      tool: toolRuns.tool,
      status: toolRuns.status,
      createdAt: toolRuns.createdAt,
      accountName: accounts.name,
    })
    .from(toolRuns)
    .innerJoin(accounts, eq(toolRuns.accountId, accounts.id))
    .where(and(inArray(toolRuns.accountId, accountIds), gte(toolRuns.createdAt, since)))
    .orderBy(desc(toolRuns.createdAt))
    .limit(10);
}

async function fetchRecentEngagement(accountIds: string[]) {
  if (accountIds.length === 0) return [];
  const profiles = await db
    .select({ id: engagementProfiles.id, displayName: engagementProfiles.displayName })
    .from(engagementProfiles)
    .where(inArray(engagementProfiles.accountId, accountIds));

  if (profiles.length === 0) return [];

  const profileIds = profiles.map((p) => p.id);
  const nameMap = new Map(profiles.map((p) => [p.id, p.displayName]));

  const posts = await db
    .select({
      profileId: engagementPosts.profileId,
      content: engagementPosts.content,
      engagementStatus: engagementPosts.engagementStatus,
      agentComment: engagementPosts.agentComment,
    })
    .from(engagementPosts)
    .where(
      and(
        inArray(engagementPosts.profileId, profileIds),
        ne(engagementPosts.engagementStatus, "pending"),
      ),
    )
    .orderBy(desc(engagementPosts.createdAt))
    .limit(5);

  return posts.map((p) => ({
    profileName: nameMap.get(p.profileId) || "Unknown",
    postContent: p.content.length > 200 ? p.content.slice(0, 200) + "…" : p.content,
    engagementStatus: p.engagementStatus,
    agentComment: p.agentComment,
  }));
}

async function fetchRecentLeads(accountIds: string[], since: Date) {
  if (accountIds.length === 0) return [];
  return db
    .select({
      firstName: leads.firstName,
      lastName: leads.lastName,
      company: leads.company,
      accountName: accounts.name,
    })
    .from(leads)
    .innerJoin(accounts, eq(leads.accountId, accounts.id))
    .where(and(inArray(leads.accountId, accountIds), gte(leads.createdAt, since)))
    .orderBy(desc(leads.createdAt))
    .limit(10);
}

async function fetchPastMeetings(accountIds: string[], before: Date) {
  if (accountIds.length === 0) return [];
  // Find recent events linked to these accounts (last 3)
  const eventLinks = await db
    .select({
      eventId: calendarEventAccounts.eventId,
      accountName: accounts.name,
    })
    .from(calendarEventAccounts)
    .innerJoin(accounts, eq(calendarEventAccounts.accountId, accounts.id))
    .where(inArray(calendarEventAccounts.accountId, accountIds));

  if (eventLinks.length === 0) return [];

  const eventIds = [...new Set(eventLinks.map((e) => e.eventId))];
  const eventAccountNames = new Map<string, string[]>();
  for (const link of eventLinks) {
    const existing = eventAccountNames.get(link.eventId) || [];
    existing.push(link.accountName);
    eventAccountNames.set(link.eventId, existing);
  }

  const pastEvents = await db
    .select({ id: calendarEvents.id, summary: calendarEvents.summary, startTime: calendarEvents.startTime })
    .from(calendarEvents)
    .where(and(inArray(calendarEvents.id, eventIds), lt(calendarEvents.startTime, before)))
    .orderBy(desc(calendarEvents.startTime))
    .limit(3);

  return pastEvents.map((e) => ({
    summary: e.summary,
    startTime: e.startTime,
    accountNames: eventAccountNames.get(e.id) || [],
  }));
}

async function fetchLatestAnalytics(accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return db
    .select({
      accountName: accounts.name,
      reportType: analyticsReports.reportType,
      periodStart: analyticsReports.periodStart,
      periodEnd: analyticsReports.periodEnd,
    })
    .from(analyticsReports)
    .innerJoin(accounts, eq(analyticsReports.accountId, accounts.id))
    .where(inArray(analyticsReports.accountId, accountIds))
    .orderBy(desc(analyticsReports.createdAt))
    .limit(3);
}
