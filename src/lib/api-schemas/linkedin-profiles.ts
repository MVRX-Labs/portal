import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

export const linkedinProfileSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    linkedinUrl: z.string(),
    linkedinSlug: z.string().nullable(),
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

export type LinkedinProfile = z.infer<typeof linkedinProfileSchema>;

// GET /api/accounts/[id]/linkedin-profiles
export const getLinkedinProfilesResponseSchema = z.object({
  profiles: z.array(linkedinProfileSchema),
});

export type GetLinkedinProfilesResponse = z.infer<typeof getLinkedinProfilesResponseSchema>;

// PATCH /api/accounts/[id]/linkedin-profiles/[profileId]
export const patchLinkedinProfileBodySchema = z.object({
  analyticsEnabled: z.boolean().optional(),
  outboundEnabled: z.boolean().optional(),
  inboundEnabled: z.boolean().optional(),
});

export type PatchLinkedinProfileBody = z.infer<typeof patchLinkedinProfileBodySchema>;

export const patchLinkedinProfileResponseSchema = linkedinProfileSchema;

export type PatchLinkedinProfileResponse = z.infer<typeof patchLinkedinProfileResponseSchema>;
