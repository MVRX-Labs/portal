import { z } from "zod";
import { paginationSchema, dateString } from "./common";

export const leadSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  linkedinUrl: z.string(),
  headline: z.string().nullable(),
  company: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
  engagementTypes: z.unknown(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable().optional(),
  firstSeenAt: dateString,
  lastSeenAt: dateString,
});

export type Lead = z.infer<typeof leadSchema>;

// GET /api/accounts/[id]/leads
export const getLeadsResponseSchema = z.object({
  leads: z.array(leadSchema),
  pagination: paginationSchema,
});

export type GetLeadsResponse = z.infer<typeof getLeadsResponseSchema>;

// POST /api/accounts/[id]/leads/scrape
export const scrapeLeadsBodySchema = z.object({
  contactId: z.string().optional(),
  daysBack: z.number().optional(),
});

export type ScrapeLeadsBody = z.infer<typeof scrapeLeadsBodySchema>;

export const scrapeLeadsResponseSchema = z.object({
  triggered: z.number(),
  syncBatchId: z.string(),
  upsertBatchId: z.string(),
  profiles: z.array(
    z.object({
      id: z.string(),
      linkedinUrl: z.string(),
      displayName: z.string(),
    })
  ),
});

export type ScrapeLeadsResponse = z.infer<typeof scrapeLeadsResponseSchema>;
