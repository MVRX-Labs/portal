import { z } from "zod";
import { dateString } from "./common";

// --- Secret Types ---

export const secretTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: dateString,
});

export type SecretType = z.infer<typeof secretTypeSchema>;

export const getSecretTypesResponseSchema = z.object({
  secretTypes: z.array(secretTypeSchema),
});

export type GetSecretTypesResponse = z.infer<typeof getSecretTypesResponseSchema>;

export const createSecretTypeBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export type CreateSecretTypeBody = z.infer<typeof createSecretTypeBodySchema>;

export const createSecretTypeResponseSchema = z.object({
  secretType: secretTypeSchema,
});

export type CreateSecretTypeResponse = z.infer<typeof createSecretTypeResponseSchema>;

// --- Secrets ---

export const secretSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  contactId: z.string().nullable(),
  typeId: z.string(),
  typeName: z.string(),
  name: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  accountName: z.string(),
  contactName: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
});

export type Secret = z.infer<typeof secretSchema>;

export const getSecretsResponseSchema = z.object({
  secrets: z.array(secretSchema),
});

export type GetSecretsResponse = z.infer<typeof getSecretsResponseSchema>;

export const createSecretBodySchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  contactId: z.string().nullable().optional(),
  typeId: z.string().min(1, "Type is required"),
  name: z.string().min(1, "Name is required"),
  value: z.string().min(1, "Value is required"),
  description: z.string().optional(),
});

export type CreateSecretBody = z.infer<typeof createSecretBodySchema>;

export const createSecretResponseSchema = z.object({
  secret: secretSchema,
});

export type CreateSecretResponse = z.infer<typeof createSecretResponseSchema>;

export const updateSecretBodySchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
  description: z.string().nullable().optional(),
  typeId: z.string().optional(),
  contactId: z.string().nullable().optional(),
});

export type UpdateSecretBody = z.infer<typeof updateSecretBodySchema>;

export const updateSecretResponseSchema = z.object({
  secret: secretSchema,
});

export type UpdateSecretResponse = z.infer<typeof updateSecretResponseSchema>;

export const deleteSecretResponseSchema = z.object({
  success: z.boolean(),
});

export type DeleteSecretResponse = z.infer<typeof deleteSecretResponseSchema>;
