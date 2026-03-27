import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

export const twitterProfileSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    twitterUrl: z.string(),
    twitterHandle: z.string().nullable(),
    displayName: z.string(),
    analyticsEnabled: z.boolean(),
    outboundEnabled: z.boolean(),
    inboundEnabled: z.boolean(),
    engagementPersona: z.string(),
    sourceType: z.string().nullable(),
    contactId: z.string().nullable(),
    active: z.boolean(),
    lastSyncedAt: dateStringNullable,
    createdAt: dateString,
    updatedAt: dateString,
  })
  .passthrough();

export type TwitterProfile = z.infer<typeof twitterProfileSchema>;

// GET /api/accounts/[id]/twitter-profiles
export const getTwitterProfilesResponseSchema = z.object({
  profiles: z.array(twitterProfileSchema),
});

export type GetTwitterProfilesResponse = z.infer<typeof getTwitterProfilesResponseSchema>;

// PATCH /api/accounts/[id]/twitter-profiles/[profileId]
export const patchTwitterProfileBodySchema = z.object({
  analyticsEnabled: z.boolean().optional(),
  outboundEnabled: z.boolean().optional(),
  inboundEnabled: z.boolean().optional(),
});

export type PatchTwitterProfileBody = z.infer<typeof patchTwitterProfileBodySchema>;

export const patchTwitterProfileResponseSchema = twitterProfileSchema;

export type PatchTwitterProfileResponse = z.infer<typeof patchTwitterProfileResponseSchema>;
