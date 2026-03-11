import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  accountActions,
  managedProfiles,
  analyticsReports,
  engagementProfiles,
} from "@/lib/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import type { WeeklyReportData } from "./analytics-report";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthBreakdown {
  meeting: number;
  content: number;
  actions: number;
  setup: number;
}

export interface AccountHealthResult {
  score: number;
  label: string;
  breakdown: HealthBreakdown;
}

// ---------------------------------------------------------------------------
// Dimension: Meeting Health (25%)
// ---------------------------------------------------------------------------

function scoreMeetingHealth(
  lastMeetingAt: Date | string | null,
  nextMeetingAt: Date | string | null,
): number {
  let score = 0;

  if (lastMeetingAt) {
    const diffMs = Date.now() - new Date(lastMeetingAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 7) score = 100;
    else if (diffDays < 14) score = 80;
    else if (diffDays < 30) score = 60;
    else if (diffDays < 90) score = 30;
    else score = 0;
  }

  if (nextMeetingAt) {
    score = Math.min(100, score + 20);
  }

  return score;
}

// ---------------------------------------------------------------------------
// Dimension: Content Health (25%)
// ---------------------------------------------------------------------------

function scoreContentFromReports(
  reports: Array<{ reportData: unknown }>,
): number {
  if (reports.length === 0) return 0;

  // Look at latest report's delta engagement
  const latest = reports[0].reportData as WeeklyReportData | null;
  if (!latest?.summary) return 30;

  const { deltaEngagement, hasComparison, totalEngagement } = latest.summary;

  if (!hasComparison) {
    // No week-over-week comparison available — score based on having content
    return totalEngagement > 0 ? 60 : 30;
  }

  if (deltaEngagement > 0) return 100;
  if (deltaEngagement === 0) return 70;
  if (deltaEngagement > -10) return 50;
  return 40;
}

// ---------------------------------------------------------------------------
// Dimension: Action Health (25%)
// ---------------------------------------------------------------------------

function scoreActionHealth(
  actions: Array<{ status: string; dueDate: Date | null }>,
): number {
  if (actions.length === 0) return 50; // neutral — no actions tracked

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdue = actions.filter(
    (a) => a.status !== "completed" && a.dueDate && new Date(a.dueDate) < now,
  ).length;
  const total = actions.length;
  const ratio = overdue / total;

  if (overdue === 0) return 100;
  if (ratio < 0.25) return 70;
  if (ratio < 0.5) return 40;
  return 20;
}

// ---------------------------------------------------------------------------
// Dimension: Setup Completeness (25%)
// ---------------------------------------------------------------------------

interface SetupInput {
  linkedinUrl: string | null;
  engagementScrapeEnabled: boolean;
  hasManagedProfiles: boolean;
  hasSlackChannel: boolean;
  contactCount: number;
}

function scoreSetup(input: SetupInput): number {
  let score = 0;
  if (input.linkedinUrl) score += 20;
  if (input.engagementScrapeEnabled) score += 20;
  if (input.hasManagedProfiles) score += 20;
  if (input.hasSlackChannel) score += 20;
  if (input.contactCount >= 1) score += 20;
  return score;
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

function healthLabel(score: number): string {
  if (score >= 75) return "Healthy";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Needs Attention";
  return "Critical";
}

// ---------------------------------------------------------------------------
// Batch compute
// ---------------------------------------------------------------------------

export async function computeAccountHealthScores(
  accountIds: string[],
): Promise<Record<string, AccountHealthResult>> {
  if (accountIds.length === 0) return {};

  // 1. Fetch account base data
  const acctRows = await db
    .select({
      id: accounts.id,
      linkedinUrl: accounts.linkedinUrl,
      engagementScrapeEnabled: accounts.engagementScrapeEnabled,
      lastMeetingAt: accounts.lastMeetingAt,
      nextMeetingAt: accounts.nextMeetingAt,
      engagementSlackChannel: accounts.engagementSlackChannel,
      analyticsSlackChannel: accounts.analyticsSlackChannel,
    })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));

  // 2. Contact counts per account
  const contactRows = await db
    .select({ accountId: contacts.accountId })
    .from(contacts)
    .where(inArray(contacts.accountId, accountIds));

  const contactCounts: Record<string, number> = {};
  for (const c of contactRows) {
    contactCounts[c.accountId] = (contactCounts[c.accountId] || 0) + 1;
  }

  // 3. Actions per account (pending only — all statuses for ratio calc)
  const actionRows = await db
    .select({
      accountId: accountActions.accountId,
      status: accountActions.status,
      dueDate: accountActions.dueDate,
    })
    .from(accountActions)
    .where(inArray(accountActions.accountId, accountIds));

  const actionsByAccount: Record<string, Array<{ status: string; dueDate: Date | null }>> = {};
  for (const a of actionRows) {
    if (!actionsByAccount[a.accountId]) actionsByAccount[a.accountId] = [];
    actionsByAccount[a.accountId].push({ status: a.status, dueDate: a.dueDate });
  }

  // 4. Managed profiles per account
  const mpRows = await db
    .select({ accountId: managedProfiles.accountId, id: managedProfiles.id })
    .from(managedProfiles)
    .where(
      and(
        inArray(managedProfiles.accountId, accountIds),
        eq(managedProfiles.active, true),
      ),
    );

  const mpByAccount: Record<string, string[]> = {};
  for (const mp of mpRows) {
    if (!mpByAccount[mp.accountId]) mpByAccount[mp.accountId] = [];
    mpByAccount[mp.accountId].push(mp.id);
  }

  // 5. Engagement profiles per account (for setup check)
  const epRows = await db
    .select({ accountId: engagementProfiles.accountId })
    .from(engagementProfiles)
    .where(inArray(engagementProfiles.accountId, accountIds));

  const hasEngProf = new Set(epRows.map((e) => e.accountId));

  // 6. Latest analytics reports per account
  const allProfileIds = Object.values(mpByAccount).flat();
  let reportsByProfile: Record<string, Array<{ reportData: unknown }>> = {};

  if (allProfileIds.length > 0) {
    const reportRows = await db
      .select({
        profileId: analyticsReports.profileId,
        reportData: analyticsReports.reportData,
      })
      .from(analyticsReports)
      .where(
        and(
          inArray(analyticsReports.accountId, accountIds),
          eq(analyticsReports.reportType, "weekly"),
        ),
      )
      .orderBy(desc(analyticsReports.periodStart));

    // Keep only latest per profile
    for (const r of reportRows) {
      const pid = r.profileId ?? "";
      if (!reportsByProfile[pid]) {
        reportsByProfile[pid] = [{ reportData: r.reportData }];
      }
    }
  }

  // 7. Compute scores
  const results: Record<string, AccountHealthResult> = {};

  for (const acct of acctRows) {
    const meeting = scoreMeetingHealth(acct.lastMeetingAt, acct.nextMeetingAt);

    // Content: average across managed profiles, or 0 if none
    const profileIds = mpByAccount[acct.id] || [];
    let content = 0;
    if (profileIds.length > 0) {
      const scores = profileIds.map((pid) => {
        const reports = reportsByProfile[pid] || [];
        return scoreContentFromReports(reports);
      });
      content = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    }

    const actions = scoreActionHealth(actionsByAccount[acct.id] || []);

    const setup = scoreSetup({
      linkedinUrl: acct.linkedinUrl,
      engagementScrapeEnabled: acct.engagementScrapeEnabled,
      hasManagedProfiles: profileIds.length > 0 || hasEngProf.has(acct.id),
      hasSlackChannel: !!(acct.engagementSlackChannel || acct.analyticsSlackChannel),
      contactCount: contactCounts[acct.id] || 0,
    });

    const score = Math.round((meeting + content + actions + setup) / 4);

    results[acct.id] = {
      score,
      label: healthLabel(score),
      breakdown: { meeting, content, actions, setup },
    };
  }

  return results;
}
