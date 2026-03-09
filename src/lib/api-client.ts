import type { ZodType } from "zod";
import { ZodError } from "zod";
import { toast } from "@/lib/toast";
import { requestVersionCheck } from "@/lib/version-check";

export async function apiFetch<T>(url: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const msg = `Failed to fetch ${url}: ${err instanceof Error ? err.message : "network error"}`;
    toast.error(msg);
    throw new Error(msg);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const msg = body.error || `API error: ${res.status}`;
    toast.error(`${url}: ${msg}`);
    requestVersionCheck();
    throw new Error(msg);
  }
  const json = await res.json();
  try {
    return schema.parse(json);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      toast.error(`${url}: invalid response — ${issues}`);
      requestVersionCheck();
    }
    throw err;
  }
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
