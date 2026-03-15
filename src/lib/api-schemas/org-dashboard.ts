import { z } from "zod";

export const orgDashboardDataSchema = z.object({
  engagementPerWeek: z.array(
    z.object({
      week: z.string(),
      likes: z.number(),
      comments: z.number(),
      reposts: z.number(),
    })
  ),
  toolUsage: z.array(
    z.object({
      week: z.string(),
      tool: z.string(),
      count: z.number(),
    })
  ),
  accountLeaderboard: z.array(
    z.object({
      accountId: z.string(),
      accountName: z.string(),
      likes: z.number(),
      comments: z.number(),
      reposts: z.number(),
    })
  ),
});

export type OrgDashboardData = z.infer<typeof orgDashboardDataSchema>;
