import { z } from "zod";
import { dateStringNullable } from "./common";

// PATCH /api/accounts/[id]/analytics/config
export const patchAnalyticsConfigBodySchema = z.object({
  analyticsSlackChannel: z.string(),
});

export type PatchAnalyticsConfigBody = z.infer<typeof patchAnalyticsConfigBodySchema>;

export const analyticsConfigResponseSchema = z.object({
  analyticsSlackChannel: z.string().nullable(),
});

export type AnalyticsConfigResponse = z.infer<typeof analyticsConfigResponseSchema>;

// Managed profiles
export const managedProfileSchema = z
  .object({
    id: z.string(),
    linkedinUrl: z.string(),
    displayName: z.string(),
    lastScrapedAt: dateStringNullable,
  })
  .passthrough();

export type ManagedProfile = z.infer<typeof managedProfileSchema>;

// GET /api/accounts/[id]/analytics/profiles (returns array directly)
export const getAnalyticsProfilesResponseSchema = z.array(managedProfileSchema);

export type GetAnalyticsProfilesResponse = z.infer<typeof getAnalyticsProfilesResponseSchema>;

// POST /api/accounts/[id]/analytics/profiles
export const createAnalyticsProfileBodySchema = z.object({
  linkedin_url: z.string().min(1, "linkedin_url required"),
  display_name: z.string().optional(),
  linkedin_slug: z.string().optional(),
});

export type CreateAnalyticsProfileBody = z.infer<typeof createAnalyticsProfileBodySchema>;

// POST /api/accounts/[id]/analytics/scrape
export const analyticsScrapeBodySchema = z.object({
  profile_id: z.string().optional(),
});

export type AnalyticsScrapeBody = z.infer<typeof analyticsScrapeBodySchema>;

export const analyticsScrapeResponseSchema = z.object({
  triggered: z.number(),
  runs: z.array(z.string()),
  profiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
});

export type AnalyticsScrapeResponse = z.infer<typeof analyticsScrapeResponseSchema>;

// Analytics data (GET /api/accounts/[id]/analytics)
export const profileSummarySchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  linkedinUrl: z.string(),
  lastScrapedAt: dateStringNullable,
  totalPosts: z.number(),
  totalEngagement: z.number(),
  totalLikes: z.number(),
  totalComments: z.number(),
  totalReposts: z.number(),
  deltaEngagement: z.number(),
  hasComparison: z.boolean(),
  report: z
    .object({
      weekStart: z.string(),
      weekEnd: z.string(),
      newPosts: z.array(
        z.object({
          postId: z.string(),
          content: z.string(),
          postUrl: z.string(),
          postedAt: z.string().nullable(),
          engagement: z.number(),
        })
      ),
      biggestMovers: z.array(
        z.object({
          postId: z.string(),
          content: z.string(),
          deltaLikes: z.number(),
          deltaComments: z.number(),
          deltaReposts: z.number(),
          deltaEngagement: z.number(),
        })
      ),
    })
    .nullable(),
});

export type ProfileSummary = z.infer<typeof profileSummarySchema>;

export const analyticsDataSchema = z.object({
  profiles: z.array(profileSummarySchema),
  totals: z.object({
    totalPosts: z.number(),
    totalEngagement: z.number(),
    deltaEngagement: z.number(),
    hasComparison: z.boolean(),
  }),
});

export type AnalyticsData = z.infer<typeof analyticsDataSchema>;
