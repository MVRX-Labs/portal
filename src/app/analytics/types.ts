export type { WeeklyReportData } from "@/lib/analytics-report";

export interface ProfileSummary {
  profileId: string;
  displayName: string;
  linkedinUrl: string;
  lastScrapedAt: string | null;
  totalPosts: number;
  totalEngagement: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  deltaEngagement: number;
  hasComparison: boolean;
  report: {
    weekStart: string;
    weekEnd: string;
    newPosts: Array<{
      postId: string;
      content: string;
      postUrl: string;
      postedAt: string | null;
      engagement: number;
    }>;
    biggestMovers: Array<{
      postId: string;
      content: string;
      deltaLikes: number;
      deltaComments: number;
      deltaReposts: number;
      deltaEngagement: number;
    }>;
  } | null;
}

export interface ManagedProfile {
  id: string;
  linkedinUrl: string;
  displayName: string;
  lastScrapedAt: string | null;
}

export interface AnalyticsData {
  profiles: ProfileSummary[];
  totals: {
    totalPosts: number;
    totalEngagement: number;
    deltaEngagement: number;
    hasComparison: boolean;
  };
}
