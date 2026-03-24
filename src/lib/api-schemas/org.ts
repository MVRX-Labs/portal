import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

// --- Users ---

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: dateString,
});

export type User = z.infer<typeof userSchema>;

// GET /api/org/users
export const getUsersResponseSchema = z.object({
  users: z.array(userSchema),
});

export type GetUsersResponse = z.infer<typeof getUsersResponseSchema>;

// POST /api/org/users
export const createUserBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const createUserResponseSchema = z.object({
  user: userSchema,
});

export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

// PUT /api/org/users
export const updateUserBodySchema = z.object({
  id: z.string().min(1, "User ID is required"),
  name: z.string().optional(),
  email: z.string().optional(),
});

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const updateUserResponseSchema = z.object({
  user: userSchema,
});

export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>;

// DELETE /api/org/users
export const deleteUserResponseSchema = z.object({
  ok: z.literal(true),
});

export type DeleteUserResponse = z.infer<typeof deleteUserResponseSchema>;

// --- Calendar ---

export const calendarSyncStateSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  calendarId: z.string(),
  hasSyncToken: z.boolean(),
  lastSyncedAt: dateStringNullable,
  lastSyncError: z.string().nullable(),
  updatedAt: dateString,
});

export const calendarStatsSchema = z.object({
  totalEvents: z.number(),
  upcomingEvents: z.number(),
  linkedAccounts: z.number(),
  linkedContacts: z.number(),
});

export const calendarEventSchema = z.object({
  id: z.string(),
  summary: z.string().nullable(),
  startTime: dateString,
  endTime: dateString,
  location: z.string().nullable(),
  organizerEmail: z.string().nullable(),
  status: z.string(),
  calendarId: z.string(),
  attendees: z.unknown(),
  htmlLink: z.string().nullable(),
  notifiedAt: dateStringNullable,
  createdAt: dateString,
  linkedAccounts: z.array(
    z.object({
      accountId: z.string(),
      accountName: z.string(),
      matchConfidence: z.string().nullable(),
      matchedVia: z.string().nullable(),
    })
  ),
  linkedContacts: z.array(
    z.object({
      contactId: z.string(),
      contactName: z.string(),
      attendeeEmail: z.string().nullable(),
      matchConfidence: z.string().nullable(),
      matchedVia: z.string().nullable(),
    })
  ),
});

// GET /api/org/calendar-events responses (depends on ?view=)
export const calendarSyncStateResponseSchema = z.object({
  syncStates: z.array(calendarSyncStateSchema),
});

export type CalendarSyncStateResponse = z.infer<typeof calendarSyncStateResponseSchema>;

export const calendarStatsResponseSchema = z.object({
  stats: calendarStatsSchema,
});

export type CalendarStatsResponse = z.infer<typeof calendarStatsResponseSchema>;

export const calendarEventsResponseSchema = z.object({
  events: z.array(calendarEventSchema),
});

export type CalendarEventsResponse = z.infer<typeof calendarEventsResponseSchema>;

// POST /api/org/calendar-sync
export const calendarSyncResponseSchema = z.object({
  triggerRunId: z.string(),
  publicAccessToken: z.string(),
});

export type CalendarSyncResponse = z.infer<typeof calendarSyncResponseSchema>;
