import { z } from "zod";

export const driveFileSchema = z.record(z.string(), z.unknown()).and(
  z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
  })
);

export type DriveFile = Record<string, unknown> & { id: string; name: string; mimeType: string };

// GET /api/resources
export const getResourcesResponseSchema = z.object({
  files: z.array(driveFileSchema),
});

export type GetResourcesResponse = z.infer<typeof getResourcesResponseSchema>;

// GET /api/resources/[fileId]
export const getFileResponseSchema = z.object({
  file: driveFileSchema,
  previewUrl: z.string().nullable(),
});

export type GetFileResponse = z.infer<typeof getFileResponseSchema>;

export const exportFileResponseSchema = z.object({
  content: z.string(),
});

export type ExportFileResponse = z.infer<typeof exportFileResponseSchema>;
