# Plan: Post-Aware Engagement Scrape Timing

## Goal

Replace the single daily overnight engagement scrape with two targeted analysis windows per post:

1. **Early window**: 6–7 hours after a post is published (captures initial momentum)
2. **Late window**: ~72 hours after a post is published (captures full reach)

New leads from each scrape must still be output as a lead list (CSV to Slack).

## Current State

- **Scheduler** (`linkedin-engagement-scheduler.ts`): Cron `0 5 * * *` (daily 5 AM UTC). Triggers `linkedin-engagement-scrape` for all opted-in accounts/contacts with `hoursBack: 25`.
- **Scrape task** (`linkedin-engagement-scrape.ts`): Calls `scrapeRecentPosts()` to discover posts from last N hours, then scrapes engagement (reactions/comments/reshares), deduplicates, upserts leads, sends CSV to Slack.
- **`scrapeRecentPosts()`** (`lib/linkedin-engagement.ts`): Fetches up to 20 recent posts from Apify, filters to those within `hoursBack` hours of now.

## Approach

Add a **time window** filter (`hoursBackMin` → `hoursBackMax`) instead of just "everything in the last N hours". Run the scheduler every 2 hours and trigger the existing scrape task twice per source — once for the early window, once for the late window.

No new tasks. No new tables. The existing lead upsert + CSV logic handles the rest.

## Changes

### 1. `src/lib/linkedin-engagement.ts` — add `hoursBackMin` parameter

**`scrapeRecentPosts(linkedinUrl, signal, hoursBack, hoursBackMin)`**

- New optional param `hoursBackMin` (default `0`).
- Currently `isRecentPost(date, hoursBack)` checks `date >= now - hoursBack*h`.
- Replace with a window check: post is included if `hoursBackMin * 3600000 <= (now - date) <= hoursBack * 3600000`.
- Rename/adjust the helper and log messages for clarity.

Concrete change to filtering logic:

```ts
// Before:
function isRecentPost(parsedDate: Date | null, hoursAgo: number): boolean {
  if (!parsedDate) return false;
  const cutoff = new Date(Date.now() - hoursAgo * 3_600_000);
  return parsedDate >= cutoff;
}

// After:
function isInTimeWindow(parsedDate: Date | null, hoursBackMax: number, hoursBackMin = 0): boolean {
  if (!parsedDate) return false;
  const now = Date.now();
  const ageMs = now - parsedDate.getTime();
  return ageMs >= hoursBackMin * 3_600_000 && ageMs <= hoursBackMax * 3_600_000;
}
```

Update the call site in `scrapeRecentPosts` and adjust the log message to say "posts between X and Y hours old".

### 2. `src/trigger/linkedin-engagement-scrape.ts` — pass through `hoursBackMin`

Add `hoursBackMin?: number` to `ScrapePayload`. Pass it to `scrapeRecentPosts`:

```ts
const recentPosts = await scrapeRecentPosts(
  linkedinUrl,
  signal,
  hoursBack ?? 25,
  hoursBackMin ?? 0 // new
);
```

Also add a `scrapeWindow?: string` field to the payload (e.g. `"early"` or `"late"`). Use it to label the Slack CSV message so Tarun knows which window the leads came from:

```
"3 new leads from Acme Corp (early analysis — 6-7h after post)"
"5 new leads from Acme Corp (72h analysis)"
```

### 3. `src/trigger/linkedin-engagement-scheduler.ts` — change cron + dual triggers

**Cron**: Change from `0 5 * * *` to `0 */2 * * *` (every 2 hours).

**For each opted-in account/contact**, trigger TWO scrapes instead of one:

```ts
// Early window: posts 5–9 hours old
items.push({
  payload: {
    ...basePayload,
    hoursBack: 9,
    hoursBackMin: 5,
    scrapeWindow: "early",
    runId: earlyRun.id,
  },
});

// Late window: posts 68–76 hours old
items.push({
  payload: {
    ...basePayload,
    hoursBack: 76,
    hoursBackMin: 68,
    scrapeWindow: "late",
    runId: lateRun.id,
  },
});
```

**Window sizing rationale**:

- Scheduler runs every 2h → each 2h slice is covered exactly once.
- Early window `5–9h`: 4h wide. With 2h cron, consecutive runs cover `5–9h`, then `5–9h` again 2h later (which maps to a different set of posts since they've aged 2h more). Actually, since the window is relative to "now", a 4h window with 2h cron interval gives 2h overlap. This is intentional — it ensures no post slips through if a scheduler run is delayed. The lead upsert is idempotent so double-scraping a post is harmless.
- Late window `68–76h`: 8h wide. Generous overlap to ensure we catch every post's 72h mark even if cron timing drifts.

### 4. Slack message labeling

In `linkedin-engagement-scrape.ts`, where the CSV is sent to Slack, include the window type:

```ts
const windowLabel =
  payload.scrapeWindow === "early"
    ? " (early analysis — ~6h after post)"
    : payload.scrapeWindow === "late"
      ? " (72h analysis)"
      : "";

const message = `${newLeads.length} new lead${newLeads.length === 1 ? "" : "s"} from *${accountName}*${windowLabel}`;
```

### 5. Backwards compatibility

- The API route `/api/accounts/[id]/leads/scrape` triggers with no `hoursBackMin` or `scrapeWindow` → defaults to `hoursBackMin: 0`, which gives the same behavior as today (all posts in last N hours).
- The `hoursBack` default of 25 still works for manual triggers.

## What Doesn't Change

- The scrape task's 4-step pipeline (discover → scrape engagement → dedup → upsert)
- Lead deduplication logic
- CSV generation and Slack file upload
- The outbound engagement section of the scheduler (stays as-is)
- `toolRuns` tracking
- Error handling and Slack failure notifications

## Cost Impact

- **Post discovery** (Apify posts actor): Currently 1x/day per source. New: 12x/day per source (every 2h), but most runs will find 0 posts in the window and exit without triggering expensive engagement scraping. Posts actor is cheap.
- **Engagement scraping** (reactions/comments/reshares actors): Currently 1x/day per post. New: 2x per post (early + late). Slightly more expensive but more targeted — we only scrape posts at meaningful time points instead of whatever happens to fall in the last 25h.
- Net: slightly higher post-discovery cost, roughly similar engagement-scraping cost.

## Implementation Order

1. Modify `scrapeRecentPosts` in `lib/linkedin-engagement.ts` (add `hoursBackMin`)
2. Modify `ScrapePayload` in `linkedin-engagement-scrape.ts` (add `hoursBackMin`, `scrapeWindow`)
3. Add window label to Slack CSV message
4. Modify scheduler: change cron, trigger dual windows
5. Test locally with dev CLI
6. Deploy
