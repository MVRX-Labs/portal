# Apify Response Caching

## Problem

Every Apify call costs money. Many calls are repeated with identical inputs (e.g. same LinkedIn profile scraped across multiple reports, same domain in SimilarWeb). There's no caching — every call hits Apify fresh.

## Design

### Cache layer in the database

Add an `apify_cache` table to PostgreSQL:

```sql
CREATE TABLE apify_cache (
  id TEXT PRIMARY KEY,              -- cuid2 with prefix
  cache_key TEXT NOT NULL UNIQUE,   -- sha256(actorId + sorted JSON input)
  cache_key_human TEXT NOT NULL,    -- first 200 chars of "actorId:stringified input" for debugging
  actor_id TEXT NOT NULL,
  input JSONB NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX apify_cache_expires_idx ON apify_cache (expires_at);
```

**Cache key**: `sha256(actorId + JSON.stringify(input, Object.keys(input).sort()))` — deterministic hash of actor + input so identical calls always hit the same cache entry.

**Human-readable key** (`cache_key_human`): `"actorId:JSON.stringify(input)"` truncated to 200 chars. Makes it easy to inspect the cache table directly and understand what each entry represents without having to reverse the hash.

**Why database, not Redis**: The project already uses PostgreSQL everywhere with no Redis. JSONB handles the response payloads fine. A new dependency isn't justified for this.

### Centralised TTL config

New file: `src/lib/apify/cache-config.ts`

```typescript
/** All Apify cache TTLs in one place. Edit this file to change cache durations. */

export const APIFY_CACHE_TTLS: Record<string, number> = {
  // --- Engagement data (changes rapidly) — 5 minutes ---
  Wpp1BZ6yGWjySadk3: 5 * 60, // LinkedIn Posts Scraper
  "supreme_coder/linkedin-post": 5 * 60, // LinkedIn Post (engagement-bot)
  "apimaestro~linkedin-post-reactions": 5 * 60, // Post Reactions
  "apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies": 5 * 60, // Comments & Replies
  "apimaestro~linkedin-post-reshares": 5 * 60, // Reshares/Reposts

  // --- Everything else — 1 month ---
  // (default fallback, no need to list individually)
};

/** Default TTL for actors not explicitly listed above: 30 days */
export const DEFAULT_CACHE_TTL_SECS = 30 * 24 * 60 * 60;

export function getCacheTtl(actorId: string): number {
  // Normalise slash/tilde variants so lookups are consistent
  const normalised = actorId.replace("/", "~");
  const original = actorId.replace("~", "/");
  return (
    APIFY_CACHE_TTLS[actorId] ?? APIFY_CACHE_TTLS[normalised] ?? APIFY_CACHE_TTLS[original] ?? DEFAULT_CACHE_TTL_SECS
  );
}
```

This is the single source of truth. Devs open this file to see or change any cache duration.

### Unified Apify client

New file: `src/lib/apify/client.ts`

Consolidates the 4 duplicate `runApifyActor` implementations into one. All existing call sites switch to this.

```typescript
export async function runApifyActor(
  actorId: string,
  input: unknown,
  opts?: {
    label?: string;
    retries?: number;
    timeoutSecs?: number;
    signal?: AbortSignal;
    skipCache?: boolean; // force a fresh call
  }
): Promise<unknown>;
```

**Flow**:

1. Compute cache key from `actorId` + `input`
2. If `!skipCache`, query `apify_cache` where `cache_key = key AND expires_at > NOW()`
3. If cache hit → log "cache hit" + return `response`
4. If cache miss → make the HTTP call to Apify (with retries/timeout from opts)
5. On success → upsert into `apify_cache` (insert on conflict update, so expired entries get refreshed)
6. Return response

Paginated variant:

```typescript
export async function runApifyActorPaginated(
  actorId: string,
  baseInput: Record<string, unknown>,
  opts?: { signal?: AbortSignal; maxPages?: number; runId?: string; skipCache?: boolean }
): Promise<unknown[]>;
```

Each page is cached independently (the `page_number` is part of the input hash).

### File structure

```
src/lib/apify/
├── cache-config.ts   -- TTL definitions (the "centralised place")
├── client.ts         -- runApifyActor, runApifyActorPaginated
└── index.ts          -- re-exports
```

## Migration plan (file by file)

### 1. Schema + migration

- Add `apifyCache` table to `src/lib/schema.ts`
- Run `drizzle-kit generate` to create migration
- Run `drizzle-kit migrate` to apply

### 2. Create `src/lib/apify/` module

- `cache-config.ts` — TTL map (as above)
- `client.ts` — unified client with cache check/write logic
- `index.ts` — barrel exports

### 3. Migrate `src/lib/growth-report/scrapers.ts`

- Remove local `apify()` function
- Import `runApifyActor` from `@/lib/apify`
- All individual scraper functions (`scrapeSimilarWeb`, `scrapeAhrefs`, etc.) call the new client
- `screenshotPages` gets `skipCache: true` (screenshot URLs are ephemeral S3 links)

### 4. Migrate `src/lib/linkedin-audit.ts`

- Remove local `runApifyActor()`
- Import from `@/lib/apify`
- Pass `signal` through via opts

### 5. Migrate `src/lib/linkedin-engagement.ts`

- Remove local `runApifyActor()` and `runApifyActorPaginated()`
- Import both from `@/lib/apify`
- Engagement actors (reactions, comments, reshares) will naturally get 5-min TTL from the config

### 6. Migrate `src/lib/sentiment-scraper.ts`

- Remove local `runApifyActor()`
- Import from `@/lib/apify`

### 7. Migrate `src/lib/engagement-bot.ts`

- Remove inline Apify fetch in `scrapeProfilePosts()`
- Import `runApifyActor` from `@/lib/apify`

## Things to NOT cache

- **Screenshots** (`apify/screenshot-url`): Returns ephemeral S3 URLs that expire. Use `skipCache: true`.
- Nothing else needs special treatment — the TTL config handles the rest.

## Cache cleanup

Add a simple `cleanExpiredApifyCache()` function in `client.ts` that runs `DELETE FROM apify_cache WHERE expires_at < NOW()`. Call it opportunistically (e.g. at the start of growth-report or linkedin-sync tasks) rather than adding a scheduled job. This keeps things simple.

## What this does NOT change

- No new dependencies (no Redis)
- No changes to Apify response shapes — cache is transparent
- No changes to error handling — cache misses fall through to normal Apify calls
- Existing DB patterns (Drizzle, CUID2 IDs) are reused
- Logging format stays the same, just adds "cache hit/miss" log lines
