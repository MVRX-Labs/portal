import { z } from "zod";
import { dateString } from "./common";

export const toolRunSchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  output: z.string().nullable(),
  outputUrl: z.string().nullable(),
  error: z.string().nullable(),
  userId: z.string().nullable(),
  userName: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  createdAt: dateString,
  updatedAt: dateString,
});

export type ToolRun = z.infer<typeof toolRunSchema>;

// GET /api/history
export const getHistoryResponseSchema = z.object({
  runs: z.array(toolRunSchema),
  page: z.number(),
  limit: z.number(),
});

export type GetHistoryResponse = z.infer<typeof getHistoryResponseSchema>;
