import type { ZodType } from "zod";

export async function apiFetch<T>(url: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

export async function apiMutate<T>(
  url: string,
  schema: ZodType<T>,
  options: { method: string; body?: unknown }
): Promise<T> {
  const init: RequestInit = {
    method: options.method,
    headers: { "Content-Type": "application/json" },
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  return apiFetch(url, schema, init);
}
