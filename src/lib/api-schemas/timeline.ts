import { z } from "zod";
import { dateString } from "./common";

const baseEvent = {
  id: z.string(),
  timestamp: dateString,
  summary: z.string(),
};

export const meetingEventSchema = z.object({
  ...baseEvent,
  type: z.literal("meeting"),
  title: z.string().nullable(),
  attendees: z.array(z.string()),
  htmlLink: z.string().nullable(),
});

export const knowledgeEventSchema = z.object({
  ...baseEvent,
  type: z.literal("knowledge_event"),
  source: z.string(),
  authorName: z.string().nullable(),
  contentPreview: z.string(),
  channelName: z.string().nullable(),
});

export const linkedinPostEventSchema = z.object({
  ...baseEvent,
  type: z.literal("linkedin_post"),
  postUrl: z.string(),
  contentSnippet: z.string(),
  likesCount: z.number(),
  commentsCount: z.number(),
  repostsCount: z.number(),
  profileName: z.string(),
});

export const leadEventSchema = z.object({
  ...baseEvent,
  type: z.literal("lead"),
  firstName: z.string(),
  lastName: z.string().nullable(),
  headline: z.string().nullable(),
  linkedinUrl: z.string(),
});

export const actionEventSchema = z.object({
  ...baseEvent,
  type: z.literal("action"),
  title: z.string(),
  status: z.string(),
  dueDate: z.string().nullable(),
});

export const toolRunEventSchema = z.object({
  ...baseEvent,
  type: z.literal("tool_run"),
  tool: z.string(),
  status: z.string(),
  outputUrl: z.string().nullable(),
});

export const timelineEventSchema = z.discriminatedUnion("type", [
  meetingEventSchema,
  knowledgeEventSchema,
  linkedinPostEventSchema,
  leadEventSchema,
  actionEventSchema,
  toolRunEventSchema,
]);

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const getTimelineResponseSchema = z.object({
  events: z.array(timelineEventSchema),
  nextCursor: z.string().nullable(),
});

export type GetTimelineResponse = z.infer<typeof getTimelineResponseSchema>;
