import { z } from "zod";
import { dateString } from "./common";

export const icpDefinitionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  description: z.string(),
  targetTitles: z.array(z.string()),
  targetIndustries: z.array(z.string()),
  targetCompanySizes: z.array(z.string()),
  targetSignals: z.array(z.string()),
  active: z.boolean(),
  createdAt: dateString,
  updatedAt: dateString,
});

export type IcpDefinition = z.infer<typeof icpDefinitionSchema>;

// GET /api/accounts/[id]/icp-definitions
export const getIcpDefinitionsResponseSchema = z.object({
  icpDefinitions: z.array(icpDefinitionSchema),
});

export type GetIcpDefinitionsResponse = z.infer<typeof getIcpDefinitionsResponseSchema>;

// POST /api/accounts/[id]/icp-definitions
export const createIcpDefinitionBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  targetTitles: z.array(z.string()).optional().default([]),
  targetIndustries: z.array(z.string()).optional().default([]),
  targetCompanySizes: z.array(z.string()).optional().default([]),
  targetSignals: z.array(z.string()).optional().default([]),
});

export type CreateIcpDefinitionBody = z.infer<typeof createIcpDefinitionBodySchema>;

export const createIcpDefinitionResponseSchema = z.object({
  icpDefinition: icpDefinitionSchema,
});

export type CreateIcpDefinitionResponse = z.infer<typeof createIcpDefinitionResponseSchema>;

// PATCH /api/accounts/[id]/icp-definitions/[icpId] (toggle active only)
export const patchIcpDefinitionBodySchema = z.object({
  active: z.boolean(),
});

export type PatchIcpDefinitionBody = z.infer<typeof patchIcpDefinitionBodySchema>;

export const patchIcpDefinitionResponseSchema = z.object({
  icpDefinition: icpDefinitionSchema,
});

export type PatchIcpDefinitionResponse = z.infer<typeof patchIcpDefinitionResponseSchema>;
