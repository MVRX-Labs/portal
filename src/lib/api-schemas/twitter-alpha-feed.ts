import { z } from "zod";
import { dateString, triggerRunResponseSchema } from "./common";

// --- JSONB item schemas ---

export const twitterAlphaFeedSageSchema = z.object({
  twitterUrl: z.string(),
  twitterHandle: z.string().optional(),
  displayName: z.string(),
  bio: z.string().optional(),
  rationale: z.string().optional(),
  active: z.boolean(),
});

export type TwitterAlphaFeedSage = z.infer<typeof twitterAlphaFeedSageSchema>;

export const twitterAlphaFeedKeywordSchema = z.object({
  query: z.string(),
  rationale: z.string().optional(),
  active: z.boolean(),
});

export type TwitterAlphaFeedKeyword = z.infer<typeof twitterAlphaFeedKeywordSchema>;

export const twitterAlphaFeedEntrySchema = z.object({
  tweetUrl: z.string(),
  authorName: z.string(),
  authorTwitterUrl: z.string().optional(),
  authorTwitterHandle: z.string().optional(),
  authorBio: z.string().optional(),
  content: z.string(),
  likesCount: z.number(),
  retweetsCount: z.number(),
  repliesCount: z.number(),
  viewsCount: z.number(),
  bookmarksCount: z.number(),
  postedAt: z.string().optional(),
  engagementScore: z.number(),
  sourceType: z.enum(["sage", "keyword"]),
  sourceLabel: z.string(),
});

export type TwitterAlphaFeedEntry = z.infer<typeof twitterAlphaFeedEntrySchema>;

// --- Full row schema ---

export const twitterAlphaFeedSchema = z.object({
  id: z.string(),
  icpDefinitionId: z.string(),
  accountId: z.string(),
  sages: z.array(twitterAlphaFeedSageSchema),
  keywords: z.array(twitterAlphaFeedKeywordSchema),
  dailyEntries: z.record(z.string(), z.array(twitterAlphaFeedEntrySchema)),
  createdAt: dateString,
  updatedAt: dateString,
});

export type TwitterAlphaFeed = z.infer<typeof twitterAlphaFeedSchema>;

// --- Response schemas ---

export const getTwitterAlphaFeedResponseSchema = z.object({
  twitterAlphaFeed: twitterAlphaFeedSchema.nullable(),
});

export type GetTwitterAlphaFeedResponse = z.infer<typeof getTwitterAlphaFeedResponseSchema>;

// --- Request body schemas: Sages ---

export const addTwitterAlphaFeedSageBodySchema = z.object({
  twitterUrl: z.string().min(1, "Twitter URL or @handle is required"),
  displayName: z.string().optional().default(""),
  bio: z.string().optional(),
});

export type AddTwitterAlphaFeedSageBody = z.infer<typeof addTwitterAlphaFeedSageBodySchema>;

export const toggleTwitterAlphaFeedSageBodySchema = z.object({
  twitterUrl: z.string().min(1),
  active: z.boolean(),
});

export type ToggleTwitterAlphaFeedSageBody = z.infer<typeof toggleTwitterAlphaFeedSageBodySchema>;

export const removeTwitterAlphaFeedSageBodySchema = z.object({
  twitterUrl: z.string().min(1),
});

export type RemoveTwitterAlphaFeedSageBody = z.infer<typeof removeTwitterAlphaFeedSageBodySchema>;

// --- Request body schemas: Keywords ---

export const addTwitterAlphaFeedKeywordBodySchema = z.object({
  query: z.string().min(1, "Query is required"),
});

export type AddTwitterAlphaFeedKeywordBody = z.infer<typeof addTwitterAlphaFeedKeywordBodySchema>;

export const toggleTwitterAlphaFeedKeywordBodySchema = z.object({
  query: z.string().min(1),
  active: z.boolean(),
});

export type ToggleTwitterAlphaFeedKeywordBody = z.infer<typeof toggleTwitterAlphaFeedKeywordBodySchema>;

export const removeTwitterAlphaFeedKeywordBodySchema = z.object({
  query: z.string().min(1),
});

export type RemoveTwitterAlphaFeedKeywordBody = z.infer<typeof removeTwitterAlphaFeedKeywordBodySchema>;

// --- Collection trigger ---

export const collectTwitterAlphaFeedResponseSchema = triggerRunResponseSchema;
export type CollectTwitterAlphaFeedResponse = z.infer<typeof collectTwitterAlphaFeedResponseSchema>;
