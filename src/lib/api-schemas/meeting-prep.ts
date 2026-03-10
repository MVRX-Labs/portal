import { z } from "zod";

// Payload for the meeting-prep Trigger.dev task
export const meetingPrepPayloadSchema = z.object({
  eventId: z.string().min(1, "eventId is required"),
  slackUserId: z.string().min(1, "slackUserId is required"),
  notificationTs: z.string().min(1, "notificationTs is required"),
});

export type MeetingPrepPayload = z.infer<typeof meetingPrepPayloadSchema>;
