import { z, type ZodType } from "zod";
import { NextResponse } from "next/server";

/** Accepts Date objects (from Drizzle) or strings (from JSON) and coerces to string. */
export const dateString = z.union([z.string(), z.date().transform((d) => d.toISOString())]);

/** Same as dateString but nullable. */
export const dateStringNullable = z.union([z.string(), z.date().transform((d) => d.toISOString()), z.null()]);

export async function parseBody<T>(request: Request, schema: ZodType<T>) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      data: null as never,
      error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null as never,
      error: NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 }),
    };
  }

  return { data: result.data, error: null };
}

export async function parseBodyOptional<T>(request: Request, schema: ZodType<T>): Promise<{ data: T; error: null }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }

  const result = schema.safeParse(raw);
  return { data: result.success ? result.data : ({} as unknown as T), error: null };
}

export const errorResponseSchema = z.object({
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Standard response for API routes that trigger a background job. */
export const triggerRunResponseSchema = z.object({
  triggerRunId: z.string(),
  publicAccessToken: z.string(),
});

export type TriggerRunResponse = z.infer<typeof triggerRunResponseSchema>;

export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export type Pagination = z.infer<typeof paginationSchema>;
