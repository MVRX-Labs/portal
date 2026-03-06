import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  calendarEvents,
  calendarEventContacts,
  accountActions,
  leads,
  engagementProfiles,
  engagementPosts,
  toolRuns,
} from "@/lib/schema";
import { eq, and, gte, desc, inArray } from "drizzle-orm";

export interface MeetingContext {
  account: {
    id: string;
    name: string;
    industry: string | null;
    website: string | null;
    linkedinUrl: string | null;
    summary: string | null;
    mrr: number;
    mrrCurrency: string;
  };
  event: {
    id: string;
    summary: string | null;
    startTime: Date;
    endTime: Date;
    description: string | null;
  };
  attendingContacts: Array<{
    name: string;
    accountEmail: string | null;
    linkedinUrl: string | null;
    attendeeEmail: string;
  }>;
  pendingActions: Array<{
    title: string;
    description: string | null;
    dueDate: Date | null;
  }>;
  recentLeads: Array<{
    firstName: string;
    lastName: string | null;
    headline: string | null;
    company: string | null;
    lastSeenAt: Date;
  }>;
  recentEngagement: Array<{
    profileName: string;
    postUrl: string;
    content: string;
    postedAt: Date | null;
    likesCount: number;
    commentsCount: number;
  }>;
  recentToolRuns: Array<{
    tool: string;
    status: string;
    createdAt: Date;
  }>;
}

export async function aggregateAccountContext(accountId: string, eventId: string): Promise<MeetingContext> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch account details
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      industry: accounts.industry,
      website: accounts.website,
      linkedinUrl: accounts.linkedinUrl,
      summary: accounts.summary,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  // Fetch event details
  const [event] = await db
    .select({
      id: calendarEvents.id,
      summary: calendarEvents.summary,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
      description: calendarEvents.description,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, eventId))
    .limit(1);

  // Fetch attending contacts via calendarEventContacts join
  const attendingContacts = await db
    .select({
      name: contacts.name,
      accountEmail: contacts.accountEmail,
      linkedinUrl: contacts.linkedinUrl,
      attendeeEmail: calendarEventContacts.attendeeEmail,
    })
    .from(calendarEventContacts)
    .innerJoin(contacts, eq(calendarEventContacts.contactId, contacts.id))
    .where(eq(calendarEventContacts.eventId, eventId));

  // Fetch pending actions for the account
  const pendingActions = await db
    .select({
      title: accountActions.title,
      description: accountActions.description,
      dueDate: accountActions.dueDate,
    })
    .from(accountActions)
    .where(and(eq(accountActions.accountId, accountId), eq(accountActions.status, "pending")));

  // Recent leads (last 14 days, top 10)
  const recentLeads = await db
    .select({
      firstName: leads.firstName,
      lastName: leads.lastName,
      headline: leads.headline,
      company: leads.company,
      lastSeenAt: leads.lastSeenAt,
    })
    .from(leads)
    .where(and(eq(leads.accountId, accountId), gte(leads.lastSeenAt, fourteenDaysAgo)))
    .orderBy(desc(leads.lastSeenAt))
    .limit(10);

  // Recent engagement posts (last 7 days) via profiles for this account
  const profileRows = await db
    .select({ id: engagementProfiles.id, displayName: engagementProfiles.displayName })
    .from(engagementProfiles)
    .where(eq(engagementProfiles.accountId, accountId));

  let recentEngagement: MeetingContext["recentEngagement"] = [];
  if (profileRows.length > 0) {
    const profileIds = profileRows.map((p) => p.id);
    const profileNameMap = new Map(profileRows.map((p) => [p.id, p.displayName]));

    const posts = await db
      .select({
        profileId: engagementPosts.profileId,
        postUrl: engagementPosts.postUrl,
        content: engagementPosts.content,
        postedAt: engagementPosts.postedAt,
        likesCount: engagementPosts.likesCount,
        commentsCount: engagementPosts.commentsCount,
      })
      .from(engagementPosts)
      .where(and(inArray(engagementPosts.profileId, profileIds), gte(engagementPosts.postedAt, sevenDaysAgo)))
      .orderBy(desc(engagementPosts.postedAt))
      .limit(10);

    recentEngagement = posts.map((p) => ({
      profileName: profileNameMap.get(p.profileId) || "Unknown",
      postUrl: p.postUrl,
      content: p.content.slice(0, 300),
      postedAt: p.postedAt,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
    }));
  }

  // Recent completed tool runs (last 30 days)
  const recentToolRuns = await db
    .select({
      tool: toolRuns.tool,
      status: toolRuns.status,
      createdAt: toolRuns.createdAt,
    })
    .from(toolRuns)
    .where(and(eq(toolRuns.accountId, accountId), eq(toolRuns.status, "completed"), gte(toolRuns.createdAt, thirtyDaysAgo)))
    .orderBy(desc(toolRuns.createdAt))
    .limit(10);

  return {
    account,
    event,
    attendingContacts,
    pendingActions,
    recentLeads,
    recentEngagement,
    recentToolRuns,
  };
}
