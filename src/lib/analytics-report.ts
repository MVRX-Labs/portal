import { db } from "@/lib/db";
import { linkedinPosts, analyticsReports } from "@/lib/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { getLinkedinProfile, listLinkedinProfiles } from "./linkedin-profiles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyReportData {
  profileId: string;
  displayName: string;
  linkedinUrl: string;
  weekStart: string;
  weekEnd: string;
  summary: {
    totalPosts: number;
    newPostsThisWeek: number;
    postsLastWeek: number;
    totalEngagement: number;
    totalLikes: number;
    totalComments: number;
    totalReposts: number;
    engagementThisWeek: number;
    avgEngagementPerPost: number;
    deltaEngagement: number;
    deltaLikes: number;
    deltaComments: number;
    deltaReposts: number;
    hasComparison: boolean;
  };
  bestPostThisWeek: {
    content: string;
    postUrl: string;
    postedAt: string | null;
    likes: number;
    comments: number;
    reposts: number;
    engagement: number;
  } | null;
  newPosts: Array<{
    postId: string;
    content: string;
    postUrl: string;
    postedAt: string | null;
    likes: number;
    comments: number;
    reposts: number;
    engagement: number;
  }>;
  biggestMovers: Array<{
    postId: string;
    content: string;
    postUrl: string;
    postedAt: string | null;
    likes: number;
    comments: number;
    reposts: number;
    deltaLikes: number;
    deltaComments: number;
    deltaReposts: number;
    deltaEngagement: number;
  }>;
  /** Per-post engagement at report time — used to compute next week's deltas. */
  _postEngagement?: Record<string, { likes: number; comments: number; reposts: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Monday of the ISO week containing `date`, at 00:00:00 UTC.
 *
 * NOTE: uses UTC consistently throughout (getUTCDay / setUTCDate / setUTCHours)
 * to avoid London DST boundary edge cases where a local-time Monday (e.g. 00:30 BST)
 * is still Sunday in UTC and would resolve to the previous week.
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

async function getPreviousReport(accountId: string, profileId: string, beforeDate: Date) {
  const [report] = await db
    .select()
    .from(analyticsReports)
    .where(
      and(
        eq(analyticsReports.accountId, accountId),
        eq(analyticsReports.profileId, profileId),
        eq(analyticsReports.reportType, "weekly"),
        lt(analyticsReports.periodStart, beforeDate)
      )
    )
    .orderBy(desc(analyticsReports.periodStart))
    .limit(1);
  return report ?? null;
}

// ---------------------------------------------------------------------------
// Report generation — diffs against previous report, no snapshots needed
// ---------------------------------------------------------------------------

export async function generateWeeklyReport(profileId: string, weekStart?: Date): Promise<WeeklyReportData> {
  const ws = weekStart ?? getWeekStart();
  const weekEnd = new Date(ws);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const profile = await getLinkedinProfile(profileId);
  if (!profile) throw new Error(`Profile ${profileId} not found`);

  const posts = await db.select().from(linkedinPosts).where(eq(linkedinPosts.profileId, profileId));

  // Previous report for week-over-week comparison
  const prevReport = await getPreviousReport(profile.accountId, profileId, ws);
  const prevData = prevReport?.reportData as WeeklyReportData | null;
  const prevEngagement = prevData?._postEngagement ?? {};
  const hasComparison = Object.keys(prevEngagement).length > 0;

  // Snapshot current engagement for next week's diff
  const currentEngagement: Record<string, { likes: number; comments: number; reposts: number }> = {};
  for (const p of posts) {
    currentEngagement[p.id] = { likes: p.likesCount, comments: p.commentsCount, reposts: p.repostsCount };
  }

  // Totals
  const totalLikes = posts.reduce((s, p) => s + p.likesCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentsCount, 0);
  const totalReposts = posts.reduce((s, p) => s + p.repostsCount, 0);
  const totalEngagement = totalLikes + totalComments + totalReposts;

  // Deltas
  let deltaLikes = 0,
    deltaComments = 0,
    deltaReposts = 0;
  if (hasComparison) {
    for (const p of posts) {
      const prev = prevEngagement[p.id];
      if (prev) {
        deltaLikes += p.likesCount - prev.likes;
        deltaComments += p.commentsCount - prev.comments;
        deltaReposts += p.repostsCount - prev.reposts;
      } else {
        deltaLikes += p.likesCount;
        deltaComments += p.commentsCount;
        deltaReposts += p.repostsCount;
      }
    }
  }

  // New posts this week
  const weekEndMs = ws.getTime() + 7 * 86400000;
  const prevWs = new Date(ws);
  prevWs.setUTCDate(prevWs.getUTCDate() - 7);

  const newPosts = posts
    .filter((p) => p.postedAt && p.postedAt >= ws && p.postedAt < new Date(weekEndMs))
    .sort((a, b) => b.likesCount + b.commentsCount + b.repostsCount - (a.likesCount + a.commentsCount + a.repostsCount))
    .map((p) => ({
      postId: p.id,
      content: p.content,
      postUrl: p.postUrl,
      postedAt: p.postedAt?.toISOString() ?? null,
      likes: p.likesCount,
      comments: p.commentsCount,
      reposts: p.repostsCount,
      engagement: p.likesCount + p.commentsCount + p.repostsCount,
    }));

  const postsLastWeek = posts.filter((p) => p.postedAt && p.postedAt >= prevWs && p.postedAt < ws).length;

  const engagementThisWeek = newPosts.reduce((s, p) => s + p.engagement, 0);
  const avgEngagementPerPost = newPosts.length > 0 ? Math.round(engagementThisWeek / newPosts.length) : 0;

  const bestPostThisWeek =
    newPosts.length > 0
      ? {
          content: newPosts[0].content,
          postUrl: newPosts[0].postUrl,
          postedAt: newPosts[0].postedAt,
          likes: newPosts[0].likes,
          comments: newPosts[0].comments,
          reposts: newPosts[0].reposts,
          engagement: newPosts[0].engagement,
        }
      : null;

  // Biggest movers (per-post week-over-week delta)
  const movers: WeeklyReportData["biggestMovers"] = [];
  if (hasComparison) {
    for (const p of posts) {
      const prev = prevEngagement[p.id];
      if (!prev) continue;
      const dL = p.likesCount - prev.likes;
      const dC = p.commentsCount - prev.comments;
      const dR = p.repostsCount - prev.reposts;
      const dTotal = dL + dC + dR;
      if (dTotal <= 0) continue;
      movers.push({
        postId: p.id,
        content: p.content,
        postUrl: p.postUrl,
        postedAt: p.postedAt?.toISOString() ?? null,
        likes: p.likesCount,
        comments: p.commentsCount,
        reposts: p.repostsCount,
        deltaLikes: dL,
        deltaComments: dC,
        deltaReposts: dR,
        deltaEngagement: dTotal,
      });
    }
    movers.sort((a, b) => b.deltaEngagement - a.deltaEngagement);
    movers.splice(10);
  }

  return {
    profileId,
    displayName: profile.displayName,
    linkedinUrl: profile.linkedinUrl,
    weekStart: ws.toISOString(),
    weekEnd: weekEnd.toISOString(),
    summary: {
      totalPosts: posts.length,
      newPostsThisWeek: newPosts.length,
      postsLastWeek,
      totalEngagement,
      totalLikes,
      totalComments,
      totalReposts,
      engagementThisWeek,
      avgEngagementPerPost,
      deltaEngagement: deltaLikes + deltaComments + deltaReposts,
      deltaLikes,
      deltaComments,
      deltaReposts,
      hasComparison,
    },
    bestPostThisWeek,
    newPosts,
    biggestMovers: movers,
    _postEngagement: currentEngagement,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export async function saveWeeklyReport(accountId: string, profileId: string, report: WeeklyReportData) {
  const periodStart = new Date(report.weekStart);
  const periodEnd = new Date(report.weekEnd);

  const [saved] = await db
    .insert(analyticsReports)
    .values({
      accountId,
      profileId,
      reportType: "weekly",
      periodStart,
      periodEnd,
      reportData: report,
    })
    .onConflictDoUpdate({
      target: [
        analyticsReports.accountId,
        analyticsReports.profileId,
        analyticsReports.reportType,
        analyticsReports.periodStart,
      ],
      set: {
        reportData: report,
        periodEnd,
      },
    })
    .returning();

  return saved;
}

export async function getLatestReport(accountId: string, profileId: string) {
  const [report] = await db
    .select()
    .from(analyticsReports)
    .where(
      and(
        eq(analyticsReports.accountId, accountId),
        eq(analyticsReports.profileId, profileId),
        eq(analyticsReports.reportType, "weekly")
      )
    )
    .orderBy(desc(analyticsReports.periodStart))
    .limit(1);
  return report ?? null;
}

// ---------------------------------------------------------------------------
// Dashboard aggregation
// ---------------------------------------------------------------------------

export async function getAccountAnalytics(accountId: string) {
  const profiles = await listLinkedinProfiles(accountId, { analyticsEnabled: true });

  const profileReports = await Promise.all(
    profiles.map(async (profile) => {
      const report = await getLatestReport(accountId, profile.id);
      const reportData = report?.reportData as WeeklyReportData | null;

      if (!reportData) {
        const posts = await db.select().from(linkedinPosts).where(eq(linkedinPosts.profileId, profile.id));

        const totalLikes = posts.reduce((s, p) => s + p.likesCount, 0);
        const totalComments = posts.reduce((s, p) => s + p.commentsCount, 0);
        const totalReposts = posts.reduce((s, p) => s + p.repostsCount, 0);

        return {
          profileId: profile.id,
          displayName: profile.displayName,
          linkedinUrl: profile.linkedinUrl,
          lastScrapedAt: profile.lastSyncedAt?.toISOString() ?? null,
          totalPosts: posts.length,
          totalEngagement: totalLikes + totalComments + totalReposts,
          totalLikes,
          totalComments,
          totalReposts,
          deltaEngagement: 0,
          hasComparison: false,
          report: null,
        };
      }

      return {
        profileId: profile.id,
        displayName: profile.displayName,
        linkedinUrl: profile.linkedinUrl,
        lastScrapedAt: profile.lastSyncedAt?.toISOString() ?? null,
        totalPosts: reportData.summary.totalPosts,
        totalEngagement: reportData.summary.totalEngagement,
        totalLikes: reportData.summary.totalLikes,
        totalComments: reportData.summary.totalComments,
        totalReposts: reportData.summary.totalReposts,
        deltaEngagement: reportData.summary.deltaEngagement,
        hasComparison: reportData.summary.hasComparison,
        report: reportData,
      };
    })
  );

  const totalPosts = profileReports.reduce((s, p) => s + p.totalPosts, 0);
  const totalEngagement = profileReports.reduce((s, p) => s + p.totalEngagement, 0);
  const deltaEngagement = profileReports.reduce((s, p) => s + p.deltaEngagement, 0);
  const hasComparison = profileReports.some((p) => p.hasComparison);

  return {
    profiles: profileReports,
    totals: { totalPosts, totalEngagement, deltaEngagement, hasComparison },
  };
}
