/**
 * Account Risk Signals — per-subsystem risk signal detection.
 *
 * Queries calendar, knowledge, LinkedIn, and actions subsystems to surface
 * warning signs. Orchestration lives in account-risk-profiles.ts.
 */

import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarEventAccounts,
  knowledgeUnits,
  linkedinPosts,
  linkedinProfiles,
  accountActions,
} from "@/lib/schema";
import { eq, and, lt, gte, desc, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskSeverity = "high" | "medium" | "low";

export interface RiskSignal {
  type: "calendar" | "knowledge" | "linkedin" | "action";
  severity: RiskSeverity;
  message: string;
  data: Record<string, unknown>;
}

export type OverallRisk = "high" | "medium" | "low" | "healthy";

export interface AccountRiskProfile {
  accountId: string;
  accountName: string;
  mrr: number;
  mrrCurrency: string;
  signals: RiskSignal[];
  overallRisk: OverallRisk;
}

// ---------------------------------------------------------------------------
// Calendar risk signals
// ---------------------------------------------------------------------------

export async function getCalendarRiskSignals(accountId: string): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];
  const now = new Date();
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const upcomingMeetings = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .innerJoin(calendarEventAccounts, eq(calendarEventAccounts.eventId, calendarEvents.id))
    .where(
      and(
        eq(calendarEventAccounts.accountId, accountId),
        gte(calendarEvents.startTime, now),
        lt(calendarEvents.startTime, fourteenDaysFromNow),
        eq(calendarEvents.status, "confirmed"),
      ),
    )
    .limit(1);

  const recentMeetings = await db
    .select({ id: calendarEvents.id, startTime: calendarEvents.startTime })
    .from(calendarEvents)
    .innerJoin(calendarEventAccounts, eq(calendarEventAccounts.eventId, calendarEvents.id))
    .where(
      and(
        eq(calendarEventAccounts.accountId, accountId),
        lt(calendarEvents.startTime, now),
        gte(calendarEvents.startTime, fourteenDaysAgo),
        eq(calendarEvents.status, "confirmed"),
      ),
    )
    .orderBy(desc(calendarEvents.startTime))
    .limit(1);

  const hasUpcoming = upcomingMeetings.length > 0;
  const hasRecent = recentMeetings.length > 0;

  if (!hasUpcoming && !hasRecent) {
    signals.push({
      type: "calendar",
      severity: "high",
      message: "No meeting in the next 14 days and no meeting in the past 14 days",
      data: { hasUpcoming: false, hasRecent: false },
    });
  } else if (!hasUpcoming) {
    signals.push({
      type: "calendar",
      severity: "medium",
      message: "No meeting scheduled in the next 14 days",
      data: {
        hasUpcoming: false,
        lastMeetingAt: recentMeetings[0]?.startTime?.toISOString() ?? null,
      },
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Knowledge Hub risk signals
// ---------------------------------------------------------------------------

export async function getKnowledgeRiskSignals(accountId: string): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];
  const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

  const openUnits = await db
    .select({
      id: knowledgeUnits.id,
      unitType: knowledgeUnits.unitType,
      createdAt: knowledgeUnits.createdAt,
      metadata: knowledgeUnits.metadata,
    })
    .from(knowledgeUnits)
    .where(and(eq(knowledgeUnits.accountId, accountId), eq(knowledgeUnits.status, "open")))
    .orderBy(desc(knowledgeUnits.createdAt))
    .limit(100);

  const blockers = openUnits.filter((u) => u.unitType === "blocker");
  if (blockers.length > 0) {
    signals.push({
      type: "knowledge",
      severity: "high",
      message: `${blockers.length} open blocker${blockers.length > 1 ? "s" : ""} in Knowledge Hub`,
      data: { blockerCount: blockers.length, blockerIds: blockers.map((b) => b.id) },
    });
  }

  const staleItems = openUnits.filter((u) => {
    const meta = u.metadata as Record<string, unknown> | null;
    if (meta?.stale) return true;
    const created = u.createdAt ? new Date(u.createdAt) : null;
    return created ? created < threeWeeksAgo : false;
  });

  if (staleItems.length > 0) {
    signals.push({
      type: "knowledge",
      severity: staleItems.length >= 5 ? "high" : "medium",
      message: `${staleItems.length} stale open item${staleItems.length > 1 ? "s" : ""} (3+ weeks without activity)`,
      data: { staleCount: staleItems.length, staleIds: staleItems.slice(0, 10).map((s) => s.id) },
    });
  }

  if (openUnits.length >= 10) {
    signals.push({
      type: "knowledge",
      severity: openUnits.length >= 20 ? "high" : "medium",
      message: `${openUnits.length} unresolved items in Knowledge Hub`,
      data: { openCount: openUnits.length },
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// LinkedIn risk signals
// ---------------------------------------------------------------------------

export async function getLinkedinRiskSignals(accountId: string): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const profiles = await db
    .select({ id: linkedinProfiles.id })
    .from(linkedinProfiles)
    .where(
      and(
        eq(linkedinProfiles.accountId, accountId),
        eq(linkedinProfiles.inboundEnabled, true),
        eq(linkedinProfiles.active, true),
      ),
    );

  if (profiles.length === 0) return signals;

  const profileIds = profiles.map((p) => p.id);
  const recentPosts = await db
    .select({
      id: linkedinPosts.id,
      likesCount: linkedinPosts.likesCount,
      commentsCount: linkedinPosts.commentsCount,
      repostsCount: linkedinPosts.repostsCount,
      postedAt: linkedinPosts.postedAt,
    })
    .from(linkedinPosts)
    .where(and(inArray(linkedinPosts.profileId, profileIds), gte(linkedinPosts.postedAt, twentyEightDaysAgo)))
    .orderBy(desc(linkedinPosts.postedAt));

  const recentTwoWeeks = recentPosts.filter((p) => p.postedAt && p.postedAt >= fourteenDaysAgo);

  if (recentTwoWeeks.length === 0) {
    signals.push({
      type: "linkedin",
      severity: "high",
      message: "No LinkedIn posts in the past 14 days",
      data: { postCount14d: 0, totalPosts28d: recentPosts.length },
    });
    return signals;
  }

  const priorTwoWeeks = recentPosts.filter(
    (p) => p.postedAt && p.postedAt < fourteenDaysAgo && p.postedAt >= twentyEightDaysAgo,
  );

  if (priorTwoWeeks.length > 0 && recentTwoWeeks.length > 0) {
    const sumEngagement = (posts: typeof recentPosts) =>
      posts.reduce((sum, p) => sum + p.likesCount + p.commentsCount + p.repostsCount, 0);

    const recentEng = sumEngagement(recentTwoWeeks) / recentTwoWeeks.length;
    const priorEng = sumEngagement(priorTwoWeeks) / priorTwoWeeks.length;

    if (priorEng > 0) {
      const changePercent = ((recentEng - priorEng) / priorEng) * 100;
      if (changePercent <= -25) {
        signals.push({
          type: "linkedin",
          severity: changePercent <= -50 ? "high" : "medium",
          message: `LinkedIn engagement declined ${Math.abs(Math.round(changePercent))}% week-over-week`,
          data: {
            recentAvgEngagement: Math.round(recentEng),
            priorAvgEngagement: Math.round(priorEng),
            changePercent: Math.round(changePercent),
            recentPostCount: recentTwoWeeks.length,
            priorPostCount: priorTwoWeeks.length,
          },
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Account Actions risk signals
// ---------------------------------------------------------------------------

export async function getActionRiskSignals(accountId: string): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];
  const now = new Date();

  const overdueActions = await db
    .select({ id: accountActions.id, title: accountActions.title, dueDate: accountActions.dueDate })
    .from(accountActions)
    .where(
      and(eq(accountActions.accountId, accountId), eq(accountActions.status, "pending"), lt(accountActions.dueDate, now)),
    )
    .orderBy(accountActions.dueDate);

  if (overdueActions.length > 0) {
    const oldestDue = overdueActions[0].dueDate;
    const daysOverdue = oldestDue ? Math.floor((now.getTime() - oldestDue.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    signals.push({
      type: "action",
      severity: overdueActions.length >= 3 || daysOverdue >= 7 ? "high" : "medium",
      message: `${overdueActions.length} overdue action${overdueActions.length > 1 ? "s" : ""} (oldest: ${daysOverdue}d overdue)`,
      data: {
        overdueCount: overdueActions.length,
        oldestDaysOverdue: daysOverdue,
        actions: overdueActions.slice(0, 5).map((a) => ({
          id: a.id,
          title: a.title,
          dueDate: a.dueDate?.toISOString() ?? null,
        })),
      },
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Overall risk scoring
// ---------------------------------------------------------------------------

export function evaluateOverallRisk(signals: RiskSignal[]): OverallRisk {
  if (signals.length === 0) return "healthy";

  const highCount = signals.filter((s) => s.severity === "high").length;
  const mediumCount = signals.filter((s) => s.severity === "medium").length;

  if (highCount >= 2) return "high";
  if (highCount >= 1 && mediumCount >= 1) return "high";
  if (highCount >= 1) return "medium";
  if (mediumCount >= 2) return "medium";
  return "low";
}
