import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

// PATCH /api/accounts/[id]/twitter-engagement/config
export const patchTwitterEngagementConfigBodySchema = z.object({
  twitterEngagementSlackChannel: z.string(),
});

export type PatchTwitterEngagementConfigBody = z.infer<typeof patchTwitterEngagementConfigBodySchema>;

export const twitterEngagementConfigResponseSchema = z.object({
  twitterEngagementSlackChannel: z.string().nullable(),
});

export type TwitterEngagementConfigResponse = z.infer<typeof twitterEngagementConfigResponseSchema>;

// POST /api/accounts/[id]/twitter-engagement/profiles
export const createTwitterEngagementProfilesBodySchema = z.object({
  twitter_urls: z.array(z.string()).min(1, "twitter_urls must be a non-empty array"),
  engagement_persona: z.string().optional(),
});

export type CreateTwitterEngagementProfilesBody = z.infer<typeof createTwitterEngagementProfilesBodySchema>;

export const twitterEngagementProfileSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    twitterUrl: z.string(),
    twitterHandle: z.string().nullable(),
    displayName: z.string(),
    engagementPersona: z.string(),
    lastSyncedAt: dateStringNullable,
    createdAt: dateString,
  })
  .passthrough();

export type TwitterEngagementProfile = z.infer<typeof twitterEngagementProfileSchema>;

// PATCH /api/accounts/[id]/twitter-engagement/profiles/[profileId]
export const patchTwitterEngagementProfileBodySchema = z
  .object({
    engagementPersona: z.string().optional(),
    displayName: z.string().optional(),
  })
  .refine((data) => data.engagementPersona !== undefined || data.displayName !== undefined, {
    message: "No valid fields to update",
  });

export type PatchTwitterEngagementProfileBody = z.infer<typeof patchTwitterEngagementProfileBodySchema>;

// POST /api/accounts/[id]/twitter-engagement/scrape
export const twitterEngagementScrapeResponseSchema = z
  .object({
    triggered: z.number(),
  })
  .passthrough();

export type TwitterEngagementScrapeResponse = z.infer<typeof twitterEngagementScrapeResponseSchema>;

// GET /api/accounts/[id]/twitter-engagement/profiles (returns array directly)
export const twitterEngagementProfilesArraySchema = z.array(twitterEngagementProfileSchema);

export type TwitterEngagementProfilesArray = z.infer<typeof twitterEngagementProfilesArraySchema>;

// GET /api/accounts/[id]/twitter-engagement/posts
export const twitterEngagementPostSchema = z
  .object({
    id: z.string(),
    profileId: z.string(),
    tweetUrl: z.string(),
    content: z.string(),
    tweetType: z.string(),
    postedAt: dateStringNullable,
    likesCount: z.number(),
    retweetsCount: z.number(),
    quotesCount: z.number(),
    repliesCount: z.number(),
    bookmarksCount: z.number(),
    viewsCount: z.number(),
    createdAt: dateString,
  })
  .passthrough();

export type TwitterEngagementPost = z.infer<typeof twitterEngagementPostSchema>;

// GET /api/accounts/[id]/twitter-engagement/jobs
export const twitterEngagementJobSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    profileId: z.string(),
    status: z.string(),
    completedAt: dateStringNullable,
    errorMessage: z.string().nullable().optional(),
    postsFound: z.number(),
    postsNew: z.number(),
    triggerRunId: z.string().nullable().optional(),
    createdAt: dateString,
  })
  .passthrough();

export type TwitterEngagementJob = z.infer<typeof twitterEngagementJobSchema>;

export const twitterEngagementJobsArraySchema = z.array(twitterEngagementJobSchema);

export type TwitterEngagementJobsArray = z.infer<typeof twitterEngagementJobsArraySchema>;

export const twitterEngagementPostsArraySchema = z.array(twitterEngagementPostSchema);

export type TwitterEngagementPostsArray = z.infer<typeof twitterEngagementPostsArraySchema>;

// DELETE /api/accounts/[id]/twitter-engagement/profiles/[profileId]
export const deleteTwitterEngagementProfileResponseSchema = z.object({
  ok: z.literal(true),
});

export type DeleteTwitterEngagementProfileResponse = z.infer<typeof deleteTwitterEngagementProfileResponseSchema>;
