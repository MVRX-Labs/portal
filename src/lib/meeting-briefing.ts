import { db } from "@/lib/db";
import {
  accounts,
  accountActions,
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
  contacts,
  engagementPosts,
  engagementProfiles,
  users,
} from "@/lib/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import type { MeetingBriefing, BriefingAccount } from "@/lib/api-schemas/meeting-briefing";

/**
 * Gathers a rich briefing for a calendar event that has linked accounts.
 * Returns null if the event has no linked accounts.
 */
export async function gatherMeetingBriefing(
  eventId: string,
  event: { summary: string | null; startTime: Date; htmlLink: string | null; attendees: Array<{ email: string; responseStatus?: string }> },
): Promise<MeetingBriefing | null> {
  // Find linked accounts for this event
  const linkedAccounts = await db
    .select({
      accountId: calendarEventAccounts.accountId,
      name: accounts.name,
      slug: accounts.slug,
      industry: accounts.industry,
      summary: accounts.summary,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
      ownerId: accounts.ownerId,
    })
    .from(calendarEventAccounts)
    .innerJoin(accounts, eq(calendarEventAccounts.accountId, accounts.id))
    .where(eq(calendarEventAccounts.eventId, eventId));

  if (linkedAccounts.length === 0) return null;

  // Use the first linked account as the primary briefing target
  const primary = linkedAccounts[0];

  // Resolve owner name
  let ownerName: string | null = null;
  if (primary.ownerId) {
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, primary.ownerId))
      .limit(1);
    ownerName = owner?.name ?? null;
  }

  const account: BriefingAccount = {
    id: primary.accountId,
    name: primary.name,
    slug: primary.slug,
    industry: primary.industry,
    summary: primary.summary,
    mrr: primary.mrr,
    mrrCurrency: primary.mrrCurrency,
    ownerName,
  };

  // Build attendee response lookup
  const responseByEmail = new Map(
    event.attendees.map((a) => [a.email.toLowerCase(), a.responseStatus ?? null]),
  );

  // Get linked contacts with their RSVP status
  const linkedContacts = await db
    .select({
      contactName: contacts.name,
      attendeeEmail: calendarEventContacts.attendeeEmail,
    })
    .from(calendarEventContacts)
    .innerJoin(contacts, eq(calendarEventContacts.contactId, contacts.id))
    .where(eq(calendarEventContacts.eventId, eventId));

  const briefingContacts = linkedContacts.map((c) => ({
    name: c.contactName,
    email: c.attendeeEmail,
    responseStatus: responseByEmail.get(c.attendeeEmail.toLowerCase()) ?? null,
  }));

  // Fetch pending actions for this account
  const pendingActions = await db
    .select({
      id: accountActions.id,
      title: accountActions.title,
      status: accountActions.status,
      dueDate: accountActions.dueDate,
      assigneeId: accountActions.assigneeId,
    })
    .from(accountActions)
    .where(
      and(
        eq(accountActions.accountId, primary.accountId),
        eq(accountActions.status, "pending"),
      ),
    );

  // Resolve assignee names for actions
  const assigneeIds = [...new Set(pendingActions.filter((a) => a.assigneeId).map((a) => a.assigneeId!))];
  const assigneeMap = new Map<string, string>();
  for (const assigneeId of assigneeIds) {
    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, assigneeId)).limit(1);
    if (user) assigneeMap.set(assigneeId, user.name);
  }

  const briefingActions = pendingActions.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    dueDate: a.dueDate?.toISOString() ?? null,
    assigneeName: a.assigneeId ? assigneeMap.get(a.assigneeId) ?? null : null,
  }));

  // Fetch last 5 meetings for this account (excluding current event)
  const recentMeetings = await db
    .select({
      id: calendarEvents.id,
      summary: calendarEvents.summary,
      startTime: calendarEvents.startTime,
    })
    .from(calendarEvents)
    .innerJoin(calendarEventAccounts, eq(calendarEvents.id, calendarEventAccounts.eventId))
    .where(
      and(
        eq(calendarEventAccounts.accountId, primary.accountId),
        eq(calendarEvents.status, "confirmed"),
      ),
    )
    .orderBy(desc(calendarEvents.startTime))
    .limit(6);

  // Filter out current event and take up to 5
  const pastMeetings = recentMeetings
    .filter((m) => m.id !== eventId)
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      summary: m.summary,
      startTime: m.startTime.toISOString(),
    }));

  // Fetch recent engagement posts (last 7 days) via engagement profiles for this account
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentEngagement = await db
    .select({
      profileName: engagementProfiles.displayName,
      content: engagementPosts.content,
      postUrl: engagementPosts.postUrl,
      postedAt: engagementPosts.postedAt,
    })
    .from(engagementPosts)
    .innerJoin(engagementProfiles, eq(engagementPosts.profileId, engagementProfiles.id))
    .where(
      and(
        eq(engagementProfiles.accountId, primary.accountId),
        gte(engagementPosts.createdAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(engagementPosts.createdAt))
    .limit(5);

  const briefingEngagement = recentEngagement.map((e) => ({
    profileName: e.profileName,
    content: e.content.length > 200 ? e.content.slice(0, 200) + "…" : e.content,
    postUrl: e.postUrl,
    postedAt: e.postedAt?.toISOString() ?? null,
  }));

  return {
    eventId,
    eventSummary: event.summary,
    eventStartTime: event.startTime.toISOString(),
    eventHtmlLink: event.htmlLink,
    account,
    contacts: briefingContacts,
    pendingActions: briefingActions,
    recentMeetings: pastMeetings,
    recentEngagement: briefingEngagement,
  };
}
