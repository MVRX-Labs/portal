import { z } from "zod";

export const ingestSkillBodySchema = z
  .object({
    skillUrl: z.string().url().optional(),
    skillMd: z.string().optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
      .optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.skillUrl || data.skillMd, {
    message: "Either skillUrl or skillMd is required",
  });

export type IngestSkillBody = z.infer<typeof ingestSkillBodySchema>;
