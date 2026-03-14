import { db } from "@/lib/db";
import { linkedinPosts, linkedinProfiles, leads } from "@/lib/schema";
import { eq, and, isNotNull, sql, desc, gte } from "drizzle-orm";

export interface DashboardData {
  kpis: {
    totalPosts: number;
    totalEngagement: number;
    totalLeads: number;
    postsThisWeek: number;
  };
  postsPerWeek: Array<{ week: string; count: number }>;
  engagementPerWeek: Array<{
    week: string;
    likes: number;
    comments: number;
    reposts: number;
  }>;
  engagementBreakdown: {
    likes: number;
    comments: number;
    reposts: number;
  };
  leadsPerWeek: Array<{ week: string; cumulative: number }>;
  posts: Array<{
    id: string;
    content: string;
    postUrl: string;
    postedAt: string | null;
    likes: number;
    comments: number;
    reposts: number;
    engagement: number;
    profileName: string;
    category: string | null;
  }>;
  profileComparison: Array<{
    profileId: string;
    displayName: string;
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

export async function getAccountDashboardData(accountId: string): Promise<DashboardData> {
  // Week start (Monday) for "this week"
  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
  weekStart.setUTCHours(0, 0, 0, 0);

  // Run independent queries in parallel
  const [
    postsPerWeekRows,
    engagementPerWeekRows,
    engagementTotals,
    leadsPerWeekRows,
    topPostRows,
    profileRows,
    totalLeadsResult,
    postsThisWeekResult,
  ] = await Promise.all([
    // Posts per week (last 12 weeks)
    db
      .select({
        week: sql<string>`date_trunc('week', ${linkedinPosts.postedAt})`.as("week"),
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(linkedinPosts)
      .where(and(eq(linkedinPosts.accountId, accountId), isNotNull(linkedinPosts.postedAt)))
      .groupBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`)
      .orderBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`),

    // Engagement per week (grouped by post's postedAt week)
    db
      .select({
        week: sql<string>`date_trunc('week', ${linkedinPosts.postedAt})`.as("week"),
        likes: sql<number>`sum(${linkedinPosts.likesCount})::int`.as("likes"),
        comments: sql<number>`sum(${linkedinPosts.commentsCount})::int`.as("comments"),
        reposts: sql<number>`sum(${linkedinPosts.repostsCount})::int`.as("reposts"),
      })
      .from(linkedinPosts)
      .where(and(eq(linkedinPosts.accountId, accountId), isNotNull(linkedinPosts.postedAt)))
      .groupBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`)
      .orderBy(sql`date_trunc('week', ${linkedinPosts.postedAt})`),

    // Total engagement breakdown
    db
      .select({
        likes: sql<number>`coalesce(sum(${linkedinPosts.likesCount}), 0)::int`.as("likes"),
        comments: sql<number>`coalesce(sum(${linkedinPosts.commentsCount}), 0)::int`.as("comments"),
        reposts: sql<number>`coalesce(sum(${linkedinPosts.repostsCount}), 0)::int`.as("reposts"),
      })
      .from(linkedinPosts)
      .where(eq(linkedinPosts.accountId, accountId)),

    // Leads per week
    db
      .select({
        week: sql<string>`date_trunc('week', ${leads.firstSeenAt})`.as("week"),
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(leads)
      .where(eq(leads.accountId, accountId))
      .groupBy(sql`date_trunc('week', ${leads.firstSeenAt})`)
      .orderBy(sql`date_trunc('week', ${leads.firstSeenAt})`),

    // All posts, ordered by post date desc
    db
      .select({
        id: linkedinPosts.id,
        content: linkedinPosts.content,
        postUrl: linkedinPosts.postUrl,
        postedAt: linkedinPosts.postedAt,
        likes: linkedinPosts.likesCount,
        comments: linkedinPosts.commentsCount,
        reposts: linkedinPosts.repostsCount,
        profileName: linkedinProfiles.displayName,
        category: linkedinPosts.category,
      })
      .from(linkedinPosts)
      .leftJoin(linkedinProfiles, eq(linkedinPosts.profileId, linkedinProfiles.id))
      .where(eq(linkedinPosts.accountId, accountId))
      .orderBy(desc(linkedinPosts.postedAt)),

    // Profile comparison
    db
      .select({
        profileId: linkedinPosts.profileId,
        displayName: linkedinProfiles.displayName,
        likes: sql<number>`sum(${linkedinPosts.likesCount})::int`.as("likes"),
        comments: sql<number>`sum(${linkedinPosts.commentsCount})::int`.as("comments"),
        reposts: sql<number>`sum(${linkedinPosts.repostsCount})::int`.as("reposts"),
      })
      .from(linkedinPosts)
      .leftJoin(linkedinProfiles, eq(linkedinPosts.profileId, linkedinProfiles.id))
      .where(eq(linkedinPosts.accountId, accountId))
      .groupBy(linkedinPosts.profileId, linkedinProfiles.displayName)
      .orderBy(
        desc(
          sql`sum(${linkedinPosts.likesCount}) + sum(${linkedinPosts.commentsCount}) + sum(${linkedinPosts.repostsCount})`
        )
      ),

    // Total leads count
    db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(leads)
      .where(eq(leads.accountId, accountId)),

    // Posts this week
    db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(linkedinPosts)
      .where(and(eq(linkedinPosts.accountId, accountId), gte(linkedinPosts.postedAt, weekStart))),
  ]);

  const totals = engagementTotals[0] ?? { likes: 0, comments: 0, reposts: 0 };
  const totalPosts = postsPerWeekRows.reduce((s, r) => s + r.count, 0);

  // Build cumulative leads
  let cumulative = 0;
  const leadsPerWeek = leadsPerWeekRows.map((r) => {
    cumulative += r.count;
    return { week: formatWeek(r.week), cumulative };
  });

  return {
    kpis: {
      totalPosts,
      totalEngagement: totals.likes + totals.comments + totals.reposts,
      totalLeads: totalLeadsResult[0]?.count ?? 0,
      postsThisWeek: postsThisWeekResult[0]?.count ?? 0,
    },
    postsPerWeek: postsPerWeekRows.map((r) => ({
      week: formatWeek(r.week),
      count: r.count,
    })),
    engagementPerWeek: engagementPerWeekRows.map((r) => ({
      week: formatWeek(r.week),
      likes: r.likes,
      comments: r.comments,
      reposts: r.reposts,
    })),
    engagementBreakdown: {
      likes: totals.likes,
      comments: totals.comments,
      reposts: totals.reposts,
    },
    leadsPerWeek,
    posts: topPostRows.map((p) => ({
      id: p.id,
      content: p.content,
      postUrl: p.postUrl,
      postedAt: p.postedAt?.toISOString() ?? null,
      likes: p.likes,
      comments: p.comments,
      reposts: p.reposts,
      engagement: p.likes + p.comments + p.reposts,
      profileName: p.profileName ?? "Unknown",
      category: p.category,
    })),
    profileComparison: profileRows.map((r) => ({
      profileId: r.profileId,
      displayName: r.displayName ?? "Unknown",
      likes: r.likes,
      comments: r.comments,
      reposts: r.reposts,
    })),
  };
}
