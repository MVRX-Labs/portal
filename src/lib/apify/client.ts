import { createHash } from "crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { apifyCache } from "@/lib/schema";
import { getCacheTtl } from "./cache-config";
import { sendSlackNotification } from "@/lib/slack";

const APIFY_BASE = "https://api.apify.com/v2";

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) throw new Error("Missing APIFY_API_TOKEN");
  return t;
}

function sortedStringify(input: unknown): string {
  if (input === null || input === undefined) return "null";
  if (typeof input !== "object" || Array.isArray(input)) return JSON.stringify(input);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    sorted[key] = (input as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}

function computeCacheKey(actorId: string, input: unknown): string {
  const raw = actorId + sortedStringify(input);
  return createHash("sha256").update(raw).digest("hex");
}

function computeHumanKey(actorId: string, input: unknown): string {
  return `${actorId}:${JSON.stringify(input)}`.slice(0, 200);
}

type LogFn = (message: string, extra?: Record<string, unknown>) => void;

function defaultLog(message: string) {
  console.log(`[apify] ${message}`);
}

export interface RunApifyActorOpts {
  label?: string;
  retries?: number;
  timeoutSecs?: number;
  signal?: AbortSignal;
  skipCache?: boolean;
  log?: LogFn;
}

export async function runApifyActor(actorId: string, input: unknown, opts: RunApifyActorOpts = {}): Promise<unknown> {
  const { label, retries = 2, timeoutSecs, signal, skipCache = false, log = defaultLog } = opts;
  const displayName = label ?? actorId;

  // --- Cache check ---
  const cacheKey = computeCacheKey(actorId, input);
  if (!skipCache) {
    try {
      const rows = await db
        .select({ response: apifyCache.response, expiresAt: apifyCache.expiresAt })
        .from(apifyCache)
        .where(eq(apifyCache.cacheKey, cacheKey))
        .limit(1);

      if (rows.length > 0) {
        if (rows[0].expiresAt > new Date()) {
          log(`Cache hit: ${displayName}`);
          return rows[0].response;
        }
        log(`Cache expired: ${displayName} (expired ${rows[0].expiresAt.toISOString()})`);
      } else {
        log(`Cache miss: ${displayName}`);
      }
    } catch (err) {
      // Cache read failure should not block the actual API call
      log(`Cache read error (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  // --- Apify call ---
  const encodedId = actorId.includes("/") ? actorId.replace("/", "~") : actorId;
  const timeoutParam = timeoutSecs ? `&timeout=${timeoutSecs}` : "";
  const url = `${APIFY_BASE}/acts/${encodedId}/run-sync-get-dataset-items?token=${token()}${timeoutParam}`;
  log(`Scraper start: ${displayName}`);
  const start = Date.now();

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = attempt * 5000;
        log(`Scraper retry ${attempt}/${retries}: ${displayName} (waiting ${delay}ms)`);
        await new Promise((r) => setTimeout(r, delay));
      }

      const fetchTimeoutMs = ((timeoutSecs ?? 300) + 30) * 1000;
      const fetchSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(fetchTimeoutMs)])
        : AbortSignal.timeout(fetchTimeoutMs);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: fetchSignal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${displayName} failed (${res.status}): ${body.slice(0, 300)}`);
      }

      const response = await res.json();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      log(`Scraper done: ${displayName} (${elapsed}s)`);

      // --- Cache write ---
      if (!skipCache) {
        try {
          const ttlSecs = getCacheTtl(actorId);
          const expiresAt = new Date(Date.now() + ttlSecs * 1000);
          await db
            .insert(apifyCache)
            .values({
              cacheKey,
              cacheKeyHuman: computeHumanKey(actorId, input),
              actorId,
              input: input as Record<string, unknown>,
              response,
              expiresAt,
            })
            .onConflictDoUpdate({
              target: apifyCache.cacheKey,
              set: {
                response,
                cacheKeyHuman: computeHumanKey(actorId, input),
                createdAt: new Date(),
                expiresAt,
              },
            });
        } catch (err) {
          log(`Cache write error (non-fatal): ${err instanceof Error ? err.message : err}`);
        }
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isNetworkError = lastError.message.includes("fetch failed") || lastError.message.includes("ECONNREFUSED");
      if (!isNetworkError || attempt >= retries) {
        log(`Scraper failed: ${displayName} (attempt ${attempt}): ${lastError.message}`);
        throw lastError;
      }
      log(`Scraper network error: ${displayName} (attempt ${attempt}): ${lastError.message}`);
    }
  }
  throw lastError!;
}

export interface RunApifyPaginatedOpts {
  signal?: AbortSignal;
  maxPages?: number;
  runId?: string;
  skipCache?: boolean;
  log?: LogFn;
}

export async function runApifyActorPaginated(
  actorId: string,
  baseInput: Record<string, unknown>,
  opts: RunApifyPaginatedOpts = {}
): Promise<unknown[]> {
  const { signal, maxPages = 5, runId, skipCache, log = defaultLog } = opts;
  const allResults: unknown[] = [];
  let page = 1;

  while (page <= maxPages) {
    const pageInput = { ...baseInput, page_number: page };
    const results = (await runApifyActor(actorId, pageInput, {
      signal,
      skipCache,
      retries: 2,
      log,
    })) as unknown[];

    log(`Page ${page}: ${results.length} results`);
    if (results.length === 0) break;

    allResults.push(...results);

    if (results.length < 100) break;
    page++;
  }

  log(`Total fetched: ${allResults.length} (${page} page(s))`);
  if (allResults.length === 500) {
    sendSlackNotification({
      tool: "linkedin-engagement",
      userName: "trigger-task",
      error: "Paginated actor returned 500 results. Nice post Tarun.",
      runId: runId ?? "unknown",
    });
  }
  return allResults;
}

/** Delete expired cache entries. Call opportunistically, not on a schedule. */
export async function cleanExpiredApifyCache(): Promise<number> {
  const result = await db.delete(apifyCache).where(lt(apifyCache.expiresAt, new Date()));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}
