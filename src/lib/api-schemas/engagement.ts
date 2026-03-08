import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

// PATCH /api/accounts/[id]/engagement/config
export const patchEngagementConfigBodySchema = z.object({
  engagementSlackChannel: z.string(),
});

export type PatchEngagementConfigBody = z.infer<typeof patchEngagementConfigBodySchema>;

export const engagementConfigResponseSchema = z.object({
  engagementSlackChannel: z.string().nullable(),
});

export type EngagementConfigResponse = z.infer<typeof engagementConfigResponseSchema>;

// POST /api/accounts/[id]/engagement/profiles
export const createEngagementProfilesBodySchema = z.object({
  linkedin_urls: z.array(z.string()).min(1, "linkedin_urls must be a non-empty array"),
  engagement_persona: z.string().optional(),
});

export type CreateEngagementProfilesBody = z.infer<typeof createEngagementProfilesBodySchema>;

export const engagementProfileSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  linkedinUrl: z.string(),
  displayName: z.string().nullable(),
  engagementPersona: z.string().nullable(),
  lastScrapedAt: dateStringNullable,
  createdAt: dateString,
});

export type EngagementProfile = z.infer<typeof engagementProfileSchema>;

// PATCH /api/accounts/[id]/engagement/profiles/[profileId]
export const patchEngagementProfileBodySchema = z
  .object({
    engagementPersona: z.string().optional(),
    displayName: z.string().optional(),
  })
  .refine((data) => data.engagementPersona !== undefined || data.displayName !== undefined, {
    message: "No valid fields to update",
  });

export type PatchEngagementProfileBody = z.infer<typeof patchEngagementProfileBodySchema>;

// POST /api/accounts/[id]/engagement/profiles/upload
export const engagementProfilesUploadResponseSchema = z.object({
  profiles: z.array(engagementProfileSchema),
  parsed: z.number(),
});

export type EngagementProfilesUploadResponse = z.infer<typeof engagementProfilesUploadResponseSchema>;

// POST /api/accounts/[id]/engagement/scrape
export const engagementScrapeResponseSchema = z.object({
  triggered: z.number(),
  runs: z.array(z.string()),
});

export type EngagementScrapeResponse = z.infer<typeof engagementScrapeResponseSchema>;

// GET /api/accounts/[id]/engagement/profiles (returns array directly)
export const engagementProfilesArraySchema = z.array(engagementProfileSchema);

export type EngagementProfilesArray = z.infer<typeof engagementProfilesArraySchema>;

// GET /api/accounts/[id]/engagement/posts
export const engagementPostSchema = z
  .object({
    id: z.string(),
    profileId: z.string(),
    linkedinPostUrl: z.string().nullable(),
    content: z.string().nullable(),
    postedAt: dateStringNullable,
    likes: z.number(),
    comments: z.number(),
    reposts: z.number(),
    createdAt: dateString,
  })
  .passthrough();

export type EngagementPost = z.infer<typeof engagementPostSchema>;

// GET /api/accounts/[id]/engagement/jobs
export const engagementJobSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    profileId: z.string().nullable(),
    status: z.string(),
    startedAt: dateStringNullable.optional(),
    completedAt: dateStringNullable,
    error: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    postsFound: z.number().optional(),
    postsNew: z.number().optional(),
    triggerRunId: z.string().nullable().optional(),
    createdAt: dateString,
  })
  .passthrough();

export type EngagementJob = z.infer<typeof engagementJobSchema>;

// GET /api/accounts/[id]/engagement/jobs (returns array directly)
export const engagementJobsArraySchema = z.array(engagementJobSchema);

export type EngagementJobsArray = z.infer<typeof engagementJobsArraySchema>;

// GET /api/accounts/[id]/engagement/posts (returns array directly)
export const engagementPostsArraySchema = z.array(engagementPostSchema);

export type EngagementPostsArray = z.infer<typeof engagementPostsArraySchema>;

// DELETE /api/accounts/[id]/engagement/profiles/[profileId]
export const deleteEngagementProfileResponseSchema = z.object({
  ok: z.literal(true),
});

export type DeleteEngagementProfileResponse = z.infer<typeof deleteEngagementProfileResponseSchema>;
