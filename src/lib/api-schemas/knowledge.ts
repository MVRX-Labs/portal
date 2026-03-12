import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

// --- Channel schemas ---

const channelTypeSchema = z.enum(["shared", "internal"]);
const channelCategorySchema = z.enum(["client_shared", "client_internal", "general", "product", "ops"]);

export const registerChannelBodySchema = z
  .object({
    accountId: z.string().optional(),
    slackChannelId: z.string().min(1, "slackChannelId required"),
    channelType: channelTypeSchema.optional(),
    channelCategory: channelCategorySchema.optional(),
  })
  .refine(
    (data) => {
      const category = data.channelCategory ?? "client_shared";
      const isClient = category === "client_shared" || category === "client_internal";
      return !isClient || !!data.accountId;
    },
    { message: "accountId required for client channels", path: ["accountId"] },
  );

export type RegisterChannelBody = z.infer<typeof registerChannelBodySchema>;

export const channelSchema = z
  .object({
    id: z.string(),
    accountId: z.string().nullable(),
    slackChannelId: z.string(),
    slackChannelName: z.string(),
    channelType: z.string(),
    channelCategory: z.string(),
    active: z.boolean(),
    createdAt: dateString,
    lastMessageTs: z.string().nullable().optional(),
    lastSyncedAt: dateStringNullable.optional(),
    lastSyncError: z.string().nullable().optional(),
    messagesIngested: z.number().nullable().optional(),
  })
  .passthrough();

export type Channel = z.infer<typeof channelSchema>;

// --- Ingest schemas ---

export const triggerIngestBodySchema = z.object({
  channelDbId: z.string().optional(),
});

export type TriggerIngestBody = z.infer<typeof triggerIngestBodySchema>;

// --- Digest schemas ---

export const updateUnitsBodySchema = z.object({
  updates: z.array(z.object({
    unitId: z.string(),
    status: z.enum(["open", "done", "dismissed"]),
  })).min(1),
});

export type UpdateUnitsBody = z.infer<typeof updateUnitsBodySchema>;

// --- State synthesis schemas ---

export const triggerSynthesisBodySchema = z.object({
  accountId: z.string().optional(),
});

export type TriggerSynthesisBody = z.infer<typeof triggerSynthesisBodySchema>;

export const stateDocSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  stateType: z.string(),
  content: z.string(),
  version: z.number(),
  updatedAt: dateString,
  createdAt: dateString,
});

export type StateDoc = z.infer<typeof stateDocSchema>;

export const getStateResponseSchema = z.object({
  docs: z.array(stateDocSchema),
});

export type GetStateResponse = z.infer<typeof getStateResponseSchema>;

// --- Units list schemas (admin) ---

export const unitSchema = z.object({
  id: z.string(),
  accountId: z.string().nullable(),
  channelId: z.string().nullable(),
  unitType: z.string(),
  content: z.string(),
  author: z.string().nullable(),
  assignee: z.string().nullable(),
  requestedBy: z.string().nullable(),
  status: z.string(),
  dueDate: dateStringNullable.optional(),
  visibility: z.string(),
  confidence: z.number(),
  sourceEventIds: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extractedAt: dateString,
  createdAt: dateString,
  channelName: z.string().nullable().optional(),
});

export type Unit = z.infer<typeof unitSchema>;

export const getUnitsResponseSchema = z.object({
  units: z.array(unitSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type GetUnitsResponse = z.infer<typeof getUnitsResponseSchema>;

export const patchUnitBodySchema = z.object({
  status: z.enum(["open", "done", "dismissed"]).optional(),
  content: z.string().optional(),
  assignee: z.string().nullable().optional(),
});

export type PatchUnitBody = z.infer<typeof patchUnitBodySchema>;

// --- Stats schema (admin dashboard) ---

export const knowledgeStatsSchema = z.object({
  totalEvents: z.number(),
  totalUnits: z.number(),
  openUnits: z.number(),
  doneUnits: z.number(),
  lastIngestAt: dateStringNullable,
  lastNormaliseAt: dateStringNullable,
  lastDigestAt: dateStringNullable,
});

export type KnowledgeStats = z.infer<typeof knowledgeStatsSchema>;

export const getStatsResponseSchema = z.object({
  stats: knowledgeStatsSchema,
});

export type GetStatsResponse = z.infer<typeof getStatsResponseSchema>;

// --- Channel update schema ---

export const patchChannelBodySchema = z.object({
  active: z.boolean().optional(),
});

export type PatchChannelBody = z.infer<typeof patchChannelBodySchema>;

// --- Channels list response (client-side) ---

export const getChannelsResponseSchema = z.object({
  channels: z.array(channelSchema),
});

export type GetChannelsResponse = z.infer<typeof getChannelsResponseSchema>;

// --- Synthesis trigger response ---

export const triggerSynthesisResponseSchema = z.object({
  runId: z.string(),
});

export type TriggerSynthesisResponse = z.infer<typeof triggerSynthesisResponseSchema>;

// --- Sync trigger response ---

export const triggerSyncResponseSchema = z.object({
  runId: z.string(),
});

export type TriggerSyncResponse = z.infer<typeof triggerSyncResponseSchema>;

// --- Unit update response ---

export const patchUnitResponseSchema = z.object({
  unit: unitSchema,
});

export type PatchUnitResponse = z.infer<typeof patchUnitResponseSchema>;

// --- Channel update response ---

export const patchChannelResponseSchema = z.object({
  channel: channelSchema,
});

export type PatchChannelResponse = z.infer<typeof patchChannelResponseSchema>;
