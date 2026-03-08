import { z } from "zod";

// POST /api/hooks/job-complete
export const jobCompleteBodySchema = z.object({
  runId: z.string().min(1, "runId is required"),
  status: z.enum(["completed", "failed"]),
  output: z.string().optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
  apiKey: z.string(),
});

export type JobCompleteBody = z.infer<typeof jobCompleteBodySchema>;

export const jobCompleteResponseSchema = z.object({
  ok: z.literal(true),
});

export type JobCompleteResponse = z.infer<typeof jobCompleteResponseSchema>;
