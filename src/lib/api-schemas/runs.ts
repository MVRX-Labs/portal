import { z } from "zod";
import { dateString } from "./common";

export const runDetailSchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: z.string(),
  output: z.string().nullable(),
  outputUrl: z.string().nullable(),
  error: z.string().nullable(),
  triggerRunId: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
  publicAccessToken: z.string().optional(),
});

export type RunDetail = z.infer<typeof runDetailSchema>;
