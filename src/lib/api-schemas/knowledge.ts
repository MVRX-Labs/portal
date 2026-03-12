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
