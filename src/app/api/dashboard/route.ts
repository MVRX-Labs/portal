import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  accounts,
  accountActions,
  users,
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
  contacts,
  toolRuns,
  engagementPosts,
} from "@/lib/schema";
import { eq, and, gte, lte, asc, sql, ne, inArray, isNotNull } from "drizzle-orm";

export async function GET() {
  const now = new Date();

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  // Start of this week (Monday)
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const [todayEvents, actionsRows, mrrRows, activeCountResult, noMeetingCountResult, toolRunCountResult, engPostCountResult] =
    await Promise.all([
      // Today's confirmed calendar events from now onward
      db
        .select({
          id: calendarEvents.id,
          summary: calendarEvents.summary,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
        })
        .from(calendarEvents)
        .where(and(gte(calendarEvents.startTime, now), lte(calendarEvents.startTime, endOfDay), eq(calendarEvents.status, "confirmed")))
        .orderBy(asc(calendarEvents.startTime))
        .limit(20),

      // Pending actions with a due date within the next 7 days (includes overdue)
      db
        .select({
          id: accountActions.id,
          title: accountActions.title,
          dueDate: accountActions.dueDate,
          accountId: accountActions.accountId,
          accountName: accounts.name,
          assigneeName: users.name,
        })
        .from(accountActions)
        .innerJoin(accounts, eq(accountActions.accountId, accounts.id))
        .leftJoin(users, eq(accountActions.assigneeId, users.id))
        .where(and(eq(accountActions.status, "pending"), isNotNull(accountActions.dueDate), lte(accountActions.dueDate, sevenDaysOut)))
        .orderBy(asc(accountActions.dueDate))
        .limit(20),

      // MRR aggregated by currency (non-hidden accounts only)
      db
        .select({
          mrrCurrency: accounts.mrrCurrency,
          totalMrr: sql<number>`coalesce(sum(${accounts.mrr}), 0)::int`,
        })
        .from(accounts)
        .where(eq(accounts.hidden, false))
        .groupBy(accounts.mrrCurrency),

      // Active (non-hidden) account count
      db.select({ count: sql<number>`count(*)::int` }).from(accounts).where(eq(accounts.hidden, false)),

      // Accounts without a next meeting
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(accounts)
        .where(and(eq(accounts.hidden, false), sql`${accounts.nextMeetingAt} is null`)),

      // Tool runs this week
      db.select({ count: sql<number>`count(*)::int` }).from(toolRuns).where(gte(toolRuns.createdAt, weekStart)),

      // Engagement posts reviewed this week
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(engagementPosts)
        .where(and(gte(engagementPosts.createdAt, weekStart), ne(engagementPosts.engagementStatus, "pending"))),
    ]);

  // Resolve event → account and event → contact names
  const eventIds = todayEvents.map((e) => e.id);
  const eventAccountMap: Record<string, string[]> = {};
  const eventContactMap: Record<string, string[]> = {};

  if (eventIds.length > 0) {
    const [eventAccts, eventConts] = await Promise.all([
      db
        .select({ eventId: calendarEventAccounts.eventId, accountName: accounts.name })
        .from(calendarEventAccounts)
        .innerJoin(accounts, eq(calendarEventAccounts.accountId, accounts.id))
        .where(inArray(calendarEventAccounts.eventId, eventIds)),
      db
        .select({ eventId: calendarEventContacts.eventId, contactName: contacts.name })
        .from(calendarEventContacts)
        .innerJoin(contacts, eq(calendarEventContacts.contactId, contacts.id))
        .where(inArray(calendarEventContacts.eventId, eventIds)),
    ]);

    for (const row of eventAccts) {
      if (!eventAccountMap[row.eventId]) eventAccountMap[row.eventId] = [];
      eventAccountMap[row.eventId].push(row.accountName);
    }
    for (const row of eventConts) {
      if (!eventContactMap[row.eventId]) eventContactMap[row.eventId] = [];
      eventContactMap[row.eventId].push(row.contactName);
    }
  }

  const upcomingMeetings = todayEvents.map((e) => ({
    eventId: e.id,
    summary: e.summary,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime.toISOString(),
    accountNames: eventAccountMap[e.id] || [],
    contactNames: eventContactMap[e.id] || [],
  }));

  const actionsDueSoon = actionsRows.map((a) => ({
    actionId: a.id,
    title: a.title,
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    accountName: a.accountName,
    accountId: a.accountId,
    assigneeName: a.assigneeName,
    isOverdue: a.dueDate ? a.dueDate < now : false,
  }));

  const totalMrr: Record<string, number> = {};
  for (const row of mrrRows) {
    totalMrr[row.mrrCurrency] = row.totalMrr;
  }

  return NextResponse.json({
    upcomingMeetings,
    actionsDueSoon,
    portfolioSummary: {
      totalMrr,
      activeAccountCount: activeCountResult[0]?.count ?? 0,
      accountsWithoutNextMeeting: noMeetingCountResult[0]?.count ?? 0,
    },
    recentActivity: {
      toolRunsThisWeek: toolRunCountResult[0]?.count ?? 0,
      engagementPostsReviewedThisWeek: engPostCountResult[0]?.count ?? 0,
    },
  });
}
