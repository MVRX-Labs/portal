import { z } from "zod";

const weeklyDataPointSchema = z.object({
  week: z.string(),
  count: z.number(),
});

const engagementWeekSchema = z.object({
  week: z.string(),
  likes: z.number(),
  comments: z.number(),
  reposts: z.number(),
});

const postSchema = z.object({
  id: z.string(),
  content: z.string(),
  postUrl: z.string(),
  postedAt: z.string().nullable(),
  likes: z.number(),
  comments: z.number(),
  reposts: z.number(),
  engagement: z.number(),
  profileName: z.string(),
  category: z.string().nullable(),
});

const profileComparisonSchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  likes: z.number(),
  comments: z.number(),
  reposts: z.number(),
});

export const dashboardDataSchema = z.object({
  kpis: z.object({
    totalPosts: z.number(),
    totalEngagement: z.number(),
    totalLeads: z.number(),
    postsThisWeek: z.number(),
  }),
  postsPerWeek: z.array(weeklyDataPointSchema),
  engagementPerWeek: z.array(engagementWeekSchema),
  engagementBreakdown: z.object({
    likes: z.number(),
    comments: z.number(),
    reposts: z.number(),
  }),
  leadsPerWeek: z.array(z.object({ week: z.string(), cumulative: z.number() })),
  posts: z.array(postSchema),
  profileComparison: z.array(profileComparisonSchema),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;
