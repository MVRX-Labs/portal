import { db } from "@/lib/db";
import { linkedinPosts, accounts, toolRuns } from "@/lib/schema";
import { sql, and, gte, gt, desc, isNotNull, eq, notInArray } from "drizzle-orm";

// Scheduled/cron jobs to exclude from tool usage chart
const SCHEDULED_TOOLS = [
  "knowledge-slack-events",
  "knowledge-slack-ingest-scheduled",
  "knowledge-slack-ingest-channel",
  "knowledge-digest-schedule",
  "knowledge-state-synthesis-schedule",
  "knowledge-normalise-channel",
  "knowledge-normalise-all",
  "knowledge-resolve-media",
  "calendar-sync",
  "calendar-meeting-notifier",
  "weekly-analytics",
  "linkedin-sync-scheduler",
  "linkedin-sync-profile",
  "linkedin-engagement-scrape",
  "post-categoriser-scheduler",
  "code-quality-scan",
  "idea-generator",
  "track-post",
];

export interface OrgDashboardData {
  engagementPerWeek: Array<{
    week: string;
    likes: number;
    comments: number;
    reposts: number;
  }>;
  toolUsage: Array<{
    week: string;
    tool: string;
    count: number;
  }>;
  accountLeaderboard: Array<{
    accountId: string;
    accountName: string;
    likes: number;
    comments: number;
    reposts: number;
  }>;
}

function formatWeek(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${d.getUTCFullYear()}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getOrgDashboardData(): Promise<OrgDashboardData> {
  const now = new Date();
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const payingAccountFilter = and(isNotNull(accounts.mrr), gt(accounts.mrr, 0));

  const [engagementPerWeekRows, toolUsageRows, accountLeaderboardRows] = await Promise.all([
    // Engagement per week (last 12 weeks, paying accounts only)
    db
      .select({
        week: sql<string>`date_trunc('week', ${linkedinPosts.postedAt})`.as("week"),
        likes: sql<number>`sum(${linkedinPosts.likesCount})::int`.as("likes"),
        comments: sql<number>`sum(${linkedinPosts.commentsCount})::int`.as("comments"),
        reposts: sql<number>`sum(${linkedinPosts.repostsCount})::int`.as("reposts"),
      })
      .from(linkedinPosts)
      .innerJoin(accounts, eq(linkedinPosts.accountId, accounts.id))
      .where(and(isNotNull(linkedinPosts.postedAt), gte(linkedinPosts.postedAt, twelveWeeksAgo), payingAccountFilter))
      .groupBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`)
      .orderBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`),

    // Tool usage per week (last 12 weeks, exclude scheduled jobs)
    // Bucket into 7-day windows going backwards from today so the most recent
    // bucket always covers a full period ending on the current date.
    db
      .select({
        week: sql<string>`(current_date - ((current_date - ${toolRuns.createdAt}::date) / 7) * 7 - 6)::text`.as("week"),
        tool: toolRuns.tool,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(toolRuns)
      .where(and(gte(toolRuns.createdAt, twelveWeeksAgo), notInArray(toolRuns.tool, SCHEDULED_TOOLS)))
      .groupBy(sql`current_date - ((current_date - ${toolRuns.createdAt}::date) / 7) * 7 - 6`, toolRuns.tool)
      .orderBy(sql`current_date - ((current_date - ${toolRuns.createdAt}::date) / 7) * 7 - 6`),

    // Account engagement leaderboard (paying accounts only)
    db
      .select({
        accountId: linkedinPosts.accountId,
        accountName: accounts.name,
        likes: sql<number>`coalesce(sum(${linkedinPosts.likesCount}), 0)::int`.as("likes"),
        comments: sql<number>`coalesce(sum(${linkedinPosts.commentsCount}), 0)::int`.as("comments"),
        reposts: sql<number>`coalesce(sum(${linkedinPosts.repostsCount}), 0)::int`.as("reposts"),
      })
      .from(linkedinPosts)
      .innerJoin(accounts, eq(linkedinPosts.accountId, accounts.id))
      .where(payingAccountFilter)
      .groupBy(linkedinPosts.accountId, accounts.name)
      .orderBy(
        desc(
          sql`sum(${linkedinPosts.likesCount}) + sum(${linkedinPosts.commentsCount}) + sum(${linkedinPosts.repostsCount})`
        )
      ),
  ]);

  return {
    engagementPerWeek: engagementPerWeekRows.map((r) => ({
      week: formatWeek(r.week),
      likes: r.likes,
      comments: r.comments,
      reposts: r.reposts,
    })),
    toolUsage: toolUsageRows.map((r) => ({
      week: formatWeek(r.week),
      tool: r.tool,
      count: r.count,
    })),
    accountLeaderboard: accountLeaderboardRows.map((r) => ({
      accountId: r.accountId,
      accountName: r.accountName,
      likes: r.likes,
      comments: r.comments,
      reposts: r.reposts,
    })),
  };
}
