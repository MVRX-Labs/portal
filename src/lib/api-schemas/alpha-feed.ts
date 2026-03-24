import { z } from "zod";
import { dateString } from "./common";

// --- JSONB item schemas ---

export const alphaFeedSageSchema = z.object({
  linkedinUrl: z.string(),
  displayName: z.string(),
  headline: z.string().optional(),
  rationale: z.string().optional(),
  active: z.boolean(),
});

export type AlphaFeedSage = z.infer<typeof alphaFeedSageSchema>;

export const alphaFeedKeywordSchema = z.object({
  query: z.string(),
  rationale: z.string().optional(),
  active: z.boolean(),
});

export type AlphaFeedKeyword = z.infer<typeof alphaFeedKeywordSchema>;

export const alphaFeedEntrySchema = z.object({
  postUrl: z.string(),
  authorName: z.string(),
  authorLinkedinUrl: z.string().optional(),
  authorHeadline: z.string().optional(),
  content: z.string(),
  likesCount: z.number(),
  commentsCount: z.number(),
  repostsCount: z.number(),
  postedAt: z.string().optional(),
  engagementScore: z.number(),
  sourceType: z.enum(["sage", "keyword"]),
  sourceLabel: z.string(),
});

export type AlphaFeedEntry = z.infer<typeof alphaFeedEntrySchema>;

// --- Full row schema ---

export const alphaFeedSchema = z.object({
  id: z.string(),
  icpDefinitionId: z.string(),
  accountId: z.string(),
  sages: z.array(alphaFeedSageSchema),
  keywords: z.array(alphaFeedKeywordSchema),
  dailyEntries: z.record(z.string(), z.array(alphaFeedEntrySchema)),
  createdAt: dateString,
  updatedAt: dateString,
});

export type AlphaFeed = z.infer<typeof alphaFeedSchema>;

// --- Response schemas ---

export const getAlphaFeedResponseSchema = z.object({
  alphaFeed: alphaFeedSchema.nullable(),
});

export type GetAlphaFeedResponse = z.infer<typeof getAlphaFeedResponseSchema>;

// --- Request body schemas ---

export const addAlphaFeedSageBodySchema = z.object({
  linkedinUrl: z.string().min(1, "LinkedIn URL is required"),
  displayName: z.string().optional().default(""),
  headline: z.string().optional(),
});

export type AddAlphaFeedSageBody = z.infer<typeof addAlphaFeedSageBodySchema>;

export const toggleAlphaFeedSageBodySchema = z.object({
  linkedinUrl: z.string().min(1),
  active: z.boolean(),
});

export type ToggleAlphaFeedSageBody = z.infer<typeof toggleAlphaFeedSageBodySchema>;

export const removeAlphaFeedSageBodySchema = z.object({
  linkedinUrl: z.string().min(1),
});

export type RemoveAlphaFeedSageBody = z.infer<typeof removeAlphaFeedSageBodySchema>;

export const addAlphaFeedKeywordBodySchema = z.object({
  query: z.string().min(1, "Query is required"),
});

export type AddAlphaFeedKeywordBody = z.infer<typeof addAlphaFeedKeywordBodySchema>;

export const toggleAlphaFeedKeywordBodySchema = z.object({
  query: z.string().min(1),
  active: z.boolean(),
});

export type ToggleAlphaFeedKeywordBody = z.infer<typeof toggleAlphaFeedKeywordBodySchema>;

export const removeAlphaFeedKeywordBodySchema = z.object({
  query: z.string().min(1),
});

export type RemoveAlphaFeedKeywordBody = z.infer<typeof removeAlphaFeedKeywordBodySchema>;

// --- Spec generation ---

export const generateAlphaFeedSpecResponseSchema = z.object({
  triggerRunId: z.string(),
});

export type GenerateAlphaFeedSpecResponse = z.infer<typeof generateAlphaFeedSpecResponseSchema>;

// --- Collection trigger ---

export const collectAlphaFeedResponseSchema = z.object({
  triggerRunId: z.string(),
});

export type CollectAlphaFeedResponse = z.infer<typeof collectAlphaFeedResponseSchema>;
