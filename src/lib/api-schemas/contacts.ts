import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

export const contactSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    accountId: z.string(),
    accountEmail: z.string().nullable(),
    personalEmail: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    contentVoiceGuidance: z.string().nullable(),
    lastMeetingAt: dateStringNullable.optional(),
    nextMeetingAt: dateStringNullable.optional(),
    autoCreated: z.boolean().optional(),
    engagementScrapeEnabled: z.boolean(),
    createdAt: dateString,
    updatedAt: dateString,
  })
  .passthrough();

export type Contact = z.infer<typeof contactSchema>;

// GET /api/contacts
export const getContactsResponseSchema = z.object({
  contacts: z.array(contactSchema),
});

export type GetContactsResponse = z.infer<typeof getContactsResponseSchema>;

// POST /api/contacts
export const createContactBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountId: z.string().min(1, "accountId is required"),
  accountEmail: z.string().optional(),
  personalEmail: z.string().optional(),
  linkedinUrl: z.string().optional(),
  contentVoiceGuidance: z.string().optional(),
  engagementScrapeEnabled: z.boolean().optional(),
});

export type CreateContactBody = z.infer<typeof createContactBodySchema>;

export const createContactResponseSchema = z.object({
  contact: contactSchema,
});

export type CreateContactResponse = z.infer<typeof createContactResponseSchema>;

// PUT /api/contacts/[id]
export const updateContactBodySchema = z.object({
  name: z.string().optional(),
  accountEmail: z.string().nullable().optional(),
  personalEmail: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  contentVoiceGuidance: z.string().nullable().optional(),
  engagementScrapeEnabled: z.boolean().optional(),
});

export type UpdateContactBody = z.infer<typeof updateContactBodySchema>;

export const updateContactResponseSchema = z.object({
  contact: contactSchema,
});

export type UpdateContactResponse = z.infer<typeof updateContactResponseSchema>;

// GET /api/accounts/[id]/contacts
export const getAccountContactsResponseSchema = z.object({
  contacts: z.array(contactSchema),
});

export type GetAccountContactsResponse = z.infer<typeof getAccountContactsResponseSchema>;
