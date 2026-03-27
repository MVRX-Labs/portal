import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

export const accountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    industry: z.string().nullable(),
    website: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    twitterUrl: z.string().nullable(),
    googleDriveFolderId: z.string().nullable(),
    notes: z.string().nullable(),
    contentVoiceGuidance: z.string().nullable(),
    ownerId: z.string().nullable(),
    mrr: z.number(),
    mrrCurrency: z.string(),
    lastMeetingAt: dateStringNullable,
    nextMeetingAt: dateStringNullable,
    contentCalendarUrl: z.string().nullable().optional(),
    contractLinks: z
      .array(z.object({ url: z.string(), label: z.string() }))
      .nullable()
      .optional(),
    engagementSlackChannel: z.string().nullable(),
    analyticsSlackChannel: z.string().nullable(),
    createdAt: dateString,
    updatedAt: dateString,
  })
  .passthrough();

export type Account = z.infer<typeof accountSchema>;

export const accountListItemSchema = accountSchema.extend({
  ownerName: z.string().nullable().optional(),
  contactCount: z.number().optional(),
  pendingActionCount: z.number().optional(),
  autoCreated: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export type AccountListItem = z.infer<typeof accountListItemSchema>;

// GET /api/accounts
export const getAccountsResponseSchema = z.object({
  accounts: z.array(accountListItemSchema),
});

export type GetAccountsResponse = z.infer<typeof getAccountsResponseSchema>;

// GET /api/accounts/[id]
export const getAccountResponseSchema = z.object({
  account: accountSchema,
});

export type GetAccountResponse = z.infer<typeof getAccountResponseSchema>;

// POST /api/accounts
export const createAccountBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  industry: z.string().optional(),
  website: z.string().optional(),
  linkedinUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
});

export type CreateAccountBody = z.infer<typeof createAccountBodySchema>;

export const createAccountResponseSchema = z.object({
  account: accountSchema,
});

export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;

// PUT /api/accounts/[id]
export const updateAccountBodySchema = z.object({
  name: z.string().optional(),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  twitterUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  contentVoiceGuidance: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  mrr: z.number().optional(),
  mrrCurrency: z.string().optional(),
  hidden: z.boolean().optional(),
  contentCalendarUrl: z.string().nullable().optional(),
  contractLinks: z
    .array(z.object({ url: z.string(), label: z.string() }))
    .nullable()
    .optional(),
  engagementSlackChannel: z.string().nullable().optional(),
  analyticsSlackChannel: z.string().nullable().optional(),
});

export type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>;

export const updateAccountResponseSchema = z.object({
  account: accountSchema,
});

export type UpdateAccountResponse = z.infer<typeof updateAccountResponseSchema>;
