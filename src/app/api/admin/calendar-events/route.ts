import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
  calendarSyncState,
  accounts,
  contacts,
  users,
} from "@/lib/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import type { CalendarSyncResponse } from "@/lib/api-schemas/admin";

export async function GET(request: NextRequest) {
  const isAdmin = request.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "events";

  if (view === "sync-state") {
    const syncStates = await db
      .select({
        id: calendarSyncState.id,
        userId: calendarSyncState.userId,
        userName: users.name,
        userEmail: users.email,
        calendarId: calendarSyncState.calendarId,
        hasSyncToken: sql<boolean>`${calendarSyncState.syncToken} is not null`.as("has_sync_token"),
        lastSyncedAt: calendarSyncState.lastSyncedAt,
        lastSyncError: calendarSyncState.lastSyncError,
        updatedAt: calendarSyncState.updatedAt,
      })
      .from(calendarSyncState)
      .innerJoin(users, eq(calendarSyncState.userId, users.id))
      .orderBy(desc(calendarSyncState.lastSyncedAt));

    return NextResponse.json({ syncStates });
  }

  if (view === "stats") {
    const [eventCount] = await db.select({ count: sql<number>`count(*)` }).from(calendarEvents);

    const [upcomingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(calendarEvents)
      .where(and(gte(calendarEvents.startTime, new Date()), eq(calendarEvents.status, "confirmed")));

    const [accountLinkCount] = await db
      .select({ count: sql<number>`count(distinct ${calendarEventAccounts.accountId})` })
      .from(calendarEventAccounts);

    const [contactLinkCount] = await db
      .select({ count: sql<number>`count(distinct ${calendarEventContacts.contactId})` })
      .from(calendarEventContacts);

    return NextResponse.json({
      stats: {
        totalEvents: Number(eventCount.count),
        upcomingEvents: Number(upcomingCount.count),
        linkedAccounts: Number(accountLinkCount.count),
        linkedContacts: Number(contactLinkCount.count),
      },
    });
  }

  // Default: list events
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 100);
  const offset = Number(searchParams.get("offset") || "0");

  const events = await db
    .select({
      id: calendarEvents.id,
      summary: calendarEvents.summary,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
      location: calendarEvents.location,
      organizerEmail: calendarEvents.organizerEmail,
      status: calendarEvents.status,
      calendarId: calendarEvents.calendarId,
      attendees: calendarEvents.attendees,
      htmlLink: calendarEvents.htmlLink,
      notifiedAt: calendarEvents.notifiedAt,
      createdAt: calendarEvents.createdAt,
    })
    .from(calendarEvents)
    .orderBy(desc(calendarEvents.startTime))
    .limit(limit)
    .offset(offset);

  // Fetch linked accounts and contacts for each event
  const eventsWithLinks = await Promise.all(
    events.map(async (event) => {
      const linkedAccts = await db
        .select({
          accountId: accounts.id,
          accountName: accounts.name,
          matchConfidence: calendarEventAccounts.matchConfidence,
          matchedVia: calendarEventAccounts.matchedVia,
        })
        .from(calendarEventAccounts)
        .innerJoin(accounts, eq(calendarEventAccounts.accountId, accounts.id))
        .where(eq(calendarEventAccounts.eventId, event.id));

      const linkedConts = await db
        .select({
          contactId: contacts.id,
          contactName: contacts.name,
          attendeeEmail: calendarEventContacts.attendeeEmail,
          matchConfidence: calendarEventContacts.matchConfidence,
          matchedVia: calendarEventContacts.matchedVia,
        })
        .from(calendarEventContacts)
        .innerJoin(contacts, eq(calendarEventContacts.contactId, contacts.id))
        .where(eq(calendarEventContacts.eventId, event.id));

      return {
        ...event,
        linkedAccounts: linkedAccts,
        linkedContacts: linkedConts,
      };
    })
  );

  return NextResponse.json({ events: eventsWithLinks });
}
