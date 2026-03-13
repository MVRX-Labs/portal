import { z } from "zod";
import { dateString, dateStringNullable } from "./common";

export const actionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  dueDate: dateStringNullable,
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable().optional(),
  sourceUnitId: z.string().nullable().optional(),
  createdAt: dateString,
  updatedAt: dateString,
});

export type Action = z.infer<typeof actionSchema>;

// GET /api/accounts/[id]/actions
export const getActionsResponseSchema = z.object({
  actions: z.array(actionSchema),
});

export type GetActionsResponse = z.infer<typeof getActionsResponseSchema>;

// POST /api/accounts/[id]/actions
export const createActionBodySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  assigneeId: z.string().optional(),
});

export type CreateActionBody = z.infer<typeof createActionBodySchema>;

export const createActionResponseSchema = z.object({
  action: actionSchema,
});

export type CreateActionResponse = z.infer<typeof createActionResponseSchema>;

// PUT /api/accounts/[id]/actions/[actionId]
export const updateActionBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export type UpdateActionBody = z.infer<typeof updateActionBodySchema>;

export const updateActionResponseSchema = z.object({
  action: actionSchema,
});

export type UpdateActionResponse = z.infer<typeof updateActionResponseSchema>;

// DELETE /api/accounts/[id]/actions/[actionId]
export const deleteActionResponseSchema = z.object({
  success: z.literal(true),
});

export type DeleteActionResponse = z.infer<typeof deleteActionResponseSchema>;
