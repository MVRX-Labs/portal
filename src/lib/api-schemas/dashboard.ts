import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

const dashboardMeetingSchema = z.object({
  eventId: z.string(),
  summary: z.string().nullable(),
  startTime: dateString,
  endTime: dateString,
  accountNames: z.array(z.string()),
  contactNames: z.array(z.string()),
});

export type DashboardMeeting = z.infer<typeof dashboardMeetingSchema>;

const dashboardActionSchema = z.object({
  actionId: z.string(),
  title: z.string(),
  dueDate: dateStringNullable,
  accountName: z.string(),
  accountId: z.string(),
  assigneeName: z.string().nullable(),
  isOverdue: z.boolean(),
});

export type DashboardAction = z.infer<typeof dashboardActionSchema>;

const portfolioSummarySchema = z.object({
  totalMrr: z.record(z.string(), z.number()),
  activeAccountCount: z.number(),
  accountsWithoutNextMeeting: z.number(),
});

export type PortfolioSummary = z.infer<typeof portfolioSummarySchema>;

const recentActivitySchema = z.object({
  toolRunsThisWeek: z.number(),
  engagementPostsReviewedThisWeek: z.number(),
});

export type RecentActivity = z.infer<typeof recentActivitySchema>;

// GET /api/dashboard
export const getDashboardResponseSchema = z.object({
  upcomingMeetings: z.array(dashboardMeetingSchema),
  actionsDueSoon: z.array(dashboardActionSchema),
  portfolioSummary: portfolioSummarySchema,
  recentActivity: recentActivitySchema,
});

export type GetDashboardResponse = z.infer<typeof getDashboardResponseSchema>;
