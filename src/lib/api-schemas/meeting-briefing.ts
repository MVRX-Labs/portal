import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

export const briefingAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  industry: z.string().nullable(),
  summary: z.string().nullable(),
  mrr: z.number(),
  mrrCurrency: z.string(),
  ownerName: z.string().nullable(),
});

export type BriefingAccount = z.infer<typeof briefingAccountSchema>;

export const briefingActionSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  dueDate: dateStringNullable,
  assigneeName: z.string().nullable(),
});

export type BriefingAction = z.infer<typeof briefingActionSchema>;

export const briefingContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  responseStatus: z.string().nullable(),
});

export type BriefingContact = z.infer<typeof briefingContactSchema>;

export const briefingMeetingHistorySchema = z.object({
  id: z.string(),
  summary: z.string().nullable(),
  startTime: dateString,
});

export type BriefingMeetingHistory = z.infer<typeof briefingMeetingHistorySchema>;

export const briefingEngagementSchema = z.object({
  profileName: z.string(),
  content: z.string(),
  postUrl: z.string(),
  postedAt: dateStringNullable,
});

export type BriefingEngagement = z.infer<typeof briefingEngagementSchema>;

export const meetingBriefingSchema = z.object({
  eventId: z.string(),
  eventSummary: z.string().nullable(),
  eventStartTime: dateString,
  eventHtmlLink: z.string().nullable(),
  account: briefingAccountSchema,
  contacts: z.array(briefingContactSchema),
  pendingActions: z.array(briefingActionSchema),
  recentMeetings: z.array(briefingMeetingHistorySchema),
  recentEngagement: z.array(briefingEngagementSchema),
});

export type MeetingBriefing = z.infer<typeof meetingBriefingSchema>;
