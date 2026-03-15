import { db } from "@/lib/db";
import { linkedinPosts, accounts, toolRuns } from "@/lib/schema";
import { sql, and, gte, ne, desc, isNotNull, eq } from "drizzle-orm";

export interface OrgDashboardData {
  engagementPerWeek: Array<{
    week: string;
    likes: number;
    comments: number;
    reposts: number;
  }>;
  toolUsage: Array<{
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

  const [engagementPerWeekRows, toolUsageRows, accountLeaderboardRows] = await Promise.all([
    // Engagement per week (last 12 weeks, org-wide)
    db
      .select({
        week: sql<string>`date_trunc('week', ${linkedinPosts.postedAt})`.as("week"),
        likes: sql<number>`sum(${linkedinPosts.likesCount})::int`.as("likes"),
        comments: sql<number>`sum(${linkedinPosts.commentsCount})::int`.as("comments"),
        reposts: sql<number>`sum(${linkedinPosts.repostsCount})::int`.as("reposts"),
      })
      .from(linkedinPosts)
      .where(and(isNotNull(linkedinPosts.postedAt), gte(linkedinPosts.postedAt, twelveWeeksAgo)))
      .groupBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`)
      .orderBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`),

    // Tool usage (last 30 days, exclude knowledge-slack-events)
    db
      .select({
        tool: toolRuns.tool,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(toolRuns)
      .where(and(gte(toolRuns.createdAt, thirtyDaysAgo), ne(toolRuns.tool, "knowledge-slack-events")))
      .groupBy(toolRuns.tool)
      .orderBy(desc(sql`count(*)::int`)),

    // Account engagement leaderboard
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
