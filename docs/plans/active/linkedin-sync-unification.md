# LinkedIn Sync Unification

## Goal

Replace the three separate LinkedIn scraping systems (inbound engagement, outbound engagement, analytics) with a single `linkedin-sync` job that scrapes all tracked LinkedIn profiles every 30 minutes. Downstream workflows (lead discovery, outbound engagement, analytics reports) read from the unified data.

## Current State

Three independent systems, each with their own tables, scraping jobs, and schedules:

| System                     | Profile source                                                                         | Tables                                                      | Trigger task                 | Schedule                 |
| -------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------- | ------------------------ |
| **Inbound lead discovery** | `accounts.linkedinUrl` + `contacts.linkedinUrl` (where `engagementScrapeEnabled=true`) | `leads`                                                     | `linkedin-engagement-scrape` | Every 2h (via scheduler) |
| **Outbound engagement**    | `engagementProfiles`                                                                   | `engagementPosts`, `engagementJobs`, `engagementRawResults` | `outbound-engagement-scrape` | Every 2h (via scheduler) |
| **Analytics**              | `managedProfiles`                                                                      | `managedPosts`, `managedPostSnapshots`, `analyticsReports`  | `weekly-analytics`           | Monday 7am UTC           |

All three start the same way: call Apify to scrape recent posts from a LinkedIn profile. They diverge in what they do with the results.

## Target State

```
linkedin_profiles  (unified profile registry)
       │
       ▼
linkedin-sync (every 30 min) ── scrapes posts from ALL profiles via Apify
       │
       ▼
linkedin_posts  (unified post store, upserted each sync)
       │
       ├──▶ linkedin_post_snapshots  (engagement metrics time-series, created each sync)
       ├──▶ linkedin_post_comments   (comments on recent posts, scraped each sync)
       │
       ├──▶ linkedin_post_engagements  (reactions + reposts on windowed posts, scraped at ~6h and ~72h)
       │
       ├──▶ analytics report generation  (reads posts + snapshots, runs weekly)
       ├──▶ outbound engagement flow  (new posts → Slack cards, engagement workflow fields on posts)
       ├──▶ unreplied comment alerts  (new comments with no owner reply → Slack notification)
       └──▶ inbound lead discovery  (reads comments + engagements → upserts leads, no separate Apify calls)
```

Key changes:

- **One profile table** instead of three sources (accounts, contacts, engagementProfiles, managedProfiles)
- **One post table** with all fields needed by every consumer
- **One sync job** that scrapes posts for all profiles, replacing three separate scraping paths
- Engager/reactor scraping happens within the sync job at specific post age windows (~6h and ~72h), storing results for downstream lead discovery

---

## Phase 1: New Database Tables

Create new tables alongside the old ones. No data migration yet, no consumers yet.

### `linkedin_profiles`

Unified registry of every LinkedIn profile we track, for any purpose.

```
id                    text PK (prefix: "lprof")
account_id            text FK → accounts.id NOT NULL
linkedin_url          text NOT NULL
linkedin_slug         text
display_name          text NOT NULL DEFAULT ""

-- Feature flags (a profile can have multiple purposes)
analytics_enabled     boolean NOT NULL DEFAULT false   -- track post performance (replaces managedProfiles)
outbound_enabled      boolean NOT NULL DEFAULT false   -- surface posts for engagement (replaces engagementProfiles)
inbound_enabled       boolean NOT NULL DEFAULT false   -- scrape engagers for lead discovery (replaces engagementScrapeEnabled on accounts/contacts)

-- Outbound-specific
engagement_persona    text NOT NULL DEFAULT ""         -- voice guidance for AI comments (from engagementProfiles)

-- Inbound-specific
source_type           text  -- "company" | "personal" (from engagement-scrape payload)
contact_id            text FK → contacts.id            -- nullable, set when profile comes from a contact

-- Sync state
active                boolean NOT NULL DEFAULT true
last_synced_at        timestamp
created_at            timestamp NOT NULL DEFAULT now()
updated_at            timestamp NOT NULL DEFAULT now()

UNIQUE(account_id, linkedin_url)
```

### `linkedin_posts`

Every post we've seen from any tracked profile.

```
id                    text PK (prefix: "lpost")
profile_id            text FK → linkedin_profiles.id NOT NULL
account_id            text FK → accounts.id NOT NULL
apify_post_id         text NOT NULL
content               text NOT NULL DEFAULT ""
post_url              text NOT NULL DEFAULT ""
likes_count           integer NOT NULL DEFAULT 0
comments_count        integer NOT NULL DEFAULT 0
reposts_count         integer NOT NULL DEFAULT 0
posted_at             timestamp
discovered_at         timestamp NOT NULL DEFAULT now()

-- Outbound engagement workflow (null for non-outbound posts)
engagement_status     text                            -- pending/sending/sent_to_slack/processing/awaiting_action/failed/skip/engaged
slack_message_ts      text
agent_comment         text
engaged_at            timestamp

-- Engager scraping windows
early_engagers_scraped_at  timestamp                  -- set after ~6h window scrape (null = not yet)
late_engagers_scraped_at   timestamp                  -- set after ~72h window scrape (null = not yet)

created_at            timestamp NOT NULL DEFAULT now()

UNIQUE(profile_id, apify_post_id)
```

### `linkedin_post_snapshots`

Time-series of engagement metrics, captured each sync.

```
id                    text PK (prefix: "lsnap")
post_id               text FK → linkedin_posts.id NOT NULL
profile_id            text FK → linkedin_profiles.id NOT NULL
account_id            text FK → accounts.id NOT NULL
likes_count           integer NOT NULL DEFAULT 0
comments_count        integer NOT NULL DEFAULT 0
reposts_count         integer NOT NULL DEFAULT 0
captured_at           timestamp NOT NULL DEFAULT now()
```

### `linkedin_sync_runs`

Track each sync execution (replaces `engagementJobs` and ad-hoc `toolRuns` for scrapes).

```
id                    text PK (prefix: "lsync")
profile_id            text FK → linkedin_profiles.id NOT NULL
account_id            text FK → accounts.id NOT NULL
status                text NOT NULL DEFAULT "queued"   -- queued/running/completed/failed
posts_found           integer NOT NULL DEFAULT 0
posts_new             integer NOT NULL DEFAULT 0
error_message         text
apify_run_id          text
trigger_run_id        text
created_at            timestamp NOT NULL DEFAULT now()
completed_at          timestamp
```

### `linkedin_post_comments`

Comments on recent posts, scraped each sync regardless of feature flags. Used for unreplied comment detection, and potentially useful for lead discovery and analytics enrichment.

```
id                    text PK (prefix: "lcomm")
post_id               text FK → linkedin_posts.id NOT NULL
profile_id            text FK → linkedin_profiles.id NOT NULL
account_id            text FK → accounts.id NOT NULL
apify_comment_id      text NOT NULL                   -- dedup key from Apify

-- Author
author_name           text NOT NULL DEFAULT ""
author_linkedin_url   text
author_headline       text

-- Content
comment_text          text NOT NULL DEFAULT ""
commented_at          timestamp

-- Threading
parent_comment_id     text FK → linkedin_post_comments.id  -- null for top-level comments
is_reply              boolean NOT NULL DEFAULT false

-- Owner reply tracking
replied_to_by_owner   boolean NOT NULL DEFAULT false   -- has the profile owner replied to this comment?

-- Notification state
notified_at           timestamp                        -- when we sent a Slack alert (null = not yet notified)

created_at            timestamp NOT NULL DEFAULT now()

UNIQUE(post_id, apify_comment_id)
```

Notes:

- `replied_to_by_owner` is computed during sync by matching comment author URL/slug against `linkedin_profiles.linkedin_slug`
- Only top-level comments where `replied_to_by_owner = false` are candidates for alerts
- Comments are only scraped for posts within the comment scraping window (see Scraping Tiers below)

### `linkedin_post_engagements`

Reactions and reposts on posts, scraped at the ~6h and ~72h windows. Together with `linkedin_post_comments`, these give a complete picture of WHO engaged with a post — replacing the per-post Apify scraping that `linkedin-engagement-scrape` currently does on the fly.

```
id                    text PK (prefix: "leng")
post_id               text FK → linkedin_posts.id NOT NULL
profile_id            text FK → linkedin_profiles.id NOT NULL
account_id            text FK → accounts.id NOT NULL

-- Engager
author_name           text NOT NULL DEFAULT ""
author_linkedin_url   text
author_linkedin_slug  text                            -- extracted from URL for dedup
author_headline       text
author_company        text
author_profile_image  text

-- Engagement
engagement_type       text NOT NULL                   -- "reaction" | "repost"
engaged_at            timestamp                       -- when available from Apify

-- Scrape metadata
scrape_window         text                            -- "early" (~6h) | "late" (~72h) — which window discovered this
captured_at           timestamp NOT NULL DEFAULT now()

UNIQUE(post_id, author_linkedin_url, engagement_type)
```

Notes:

- Dedup by (post, author URL, type) — same person can react AND repost, but not react twice
- `author_linkedin_slug` is extracted at insert time for efficient matching/dedup against leads
- Comments are NOT stored here — they live in `linkedin_post_comments` with richer threading data
- Inbound lead discovery reads from this table + `linkedin_post_comments` instead of making its own Apify calls

### What we DON'T change yet

- `leads` table — stays as-is, inbound lead discovery writes to it
- `analyticsReports` table — stays as-is, report generation writes to it
- `engagementRawResults` — decide later whether to keep raw audit trail or drop it
- All old tables remain in place (we'll drop them in Phase 4)

### Tasks

- [x] Write Drizzle schema additions in `src/lib/schema.ts`
- [x] Generate migration (`drizzle/0021_rich_typhoid_mary.sql`)
- [ ] Run migration against production DB
- [x] Add ID prefixes to `src/lib/ids.ts`

---

## Phase 2: `linkedin-sync` Job

A single Trigger.dev scheduled task that replaces `linkedin-engagement-scheduler`, `outbound-engagement-scrape` (scraping part), and `weekly-analytics` (scraping part).

### `linkedin-sync-scheduler` (cron: `*/30 * * * *`)

1. Query all `linkedin_profiles` where `active = true`
2. Batch-trigger `linkedin-sync-profile` for each profile

### `linkedin-sync-profile` (task, queue with concurrency limit)

For a single profile:

1. Create `linkedin_sync_runs` record (status: running)
2. Call Apify to scrape recent posts (reuse `scrapeProfilePosts` / the posts actor)
3. Normalize posts (reuse `normalizePost` / `normalizeApifyPost`)
4. Filter out reposts (reuse `isManagedProfileOriginalPost` logic)
5. Upsert into `linkedin_posts` — update engagement counts, preserve engagement workflow fields
6. Create `linkedin_post_snapshots` for each post
7. **Comments** — for posts ≤7 days old: scrape comments via Apify, upsert into `linkedin_post_comments`, compute `replied_to_by_owner` by matching author against profile slug
8. **Engagers** — for posts hitting a scrape window:
   - If `posted_at` is ~6–7h ago AND `early_engagers_scraped_at IS NULL`: scrape reactions + reposts via Apify, upsert into `linkedin_post_engagements`, set `early_engagers_scraped_at`
   - If `posted_at` is ~72–73h ago AND `late_engagers_scraped_at IS NULL`: same, set `late_engagers_scraped_at`
9. Update `linkedin_profiles.last_synced_at`
10. Mark sync run as completed
11. On failure: mark sync run as failed, send Slack notification

### Scraping Tiers by Post Age

Not all data is worth scraping for every post on every sync. The sync task adjusts what it fetches based on how old a post is:

| Post age         | Post metrics          | Comments   | Reactions/Reposts (engagers)  | Notes                                                                                              |
| ---------------- | --------------------- | ---------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **≤ 24 hours**   | Every sync            | Every sync | No                            | Too early — engagement is still arriving. Wait for the 6h window.                                  |
| **~6–7 hours**   | Every sync            | Every sync | **Yes — early window scrape** | First engager snapshot. Captures early adopters.                                                   |
| **7h – 2 days**  | Every sync            | Every sync | No                            | Between windows. Metrics still updating but no engager scrape.                                     |
| **~72–73 hours** | Every sync            | Every sync | **Yes — late window scrape**  | Second engager snapshot. Captures the long tail of engagement.                                     |
| **3–7 days**     | Every sync            | Every sync | No                            | Comments still arriving, worth checking for unreplied.                                             |
| **7–30 days**    | Every sync            | No         | No                            | Engagement slows down. Unreplied comments older than 7 days are stale.                             |
| **> 30 days**    | Only if already in DB | No         | No                            | Don't ask Apify for old posts. Existing posts still get metric updates if they appear in the feed. |

**How the engager windows work:**

The sync job runs every 30 minutes. On each run, for each post, it checks `posted_at` and determines if the post has entered an engager scraping window. To avoid duplicate scrapes, `linkedin_posts` tracks:

- `early_engagers_scraped_at` — set after ~6h window scrape
- `late_engagers_scraped_at` — set after ~72h window scrape

A post gets its engagers scraped when:

- **Early window**: `posted_at` is 6–7h ago AND `early_engagers_scraped_at IS NULL`
- **Late window**: `posted_at` is 72–73h ago AND `late_engagers_scraped_at IS NULL`

Each engager scrape calls the reactions + reshares Apify actors (same ones currently used by `linkedin-engagement-scrape`) and upserts results into `linkedin_post_engagements`. Comments are already captured continuously via `linkedin_post_comments`.

The post feed scrape from Apify naturally returns recent posts (configurable via `maxPosts`). The tiering governs the **per-post Apify calls** — comments (≤7 days) and engagers (~6h and ~72h windows only).

### What this does NOT do

- Does NOT upsert leads (that's a downstream consumer reading from `linkedin_post_engagements` + `linkedin_post_comments`)
- Does NOT send Slack cards for outbound (that's a downstream consumer)
- Does NOT generate analytics reports (that's a downstream consumer)
- Does NOT send unreplied comment alerts (that's a downstream consumer)

### Tasks

- [x] Create `src/trigger/linkedin-sync.ts` with scheduler + per-profile task
- [x] Reuses existing scraping functions from `engagement-bot.ts`, `post-ingestion.ts`, `linkedin-engagement.ts`
- [x] Wire up Slack failure notifications
- [x] Create `src/lib/linkedin-profiles.ts` — CRUD + migration function
- [x] Create `scripts/migrate-linkedin-profiles.ts` — one-time migration script

---

## Phase 3: Migrate Consumers

Migrate each downstream workflow to read from the new tables instead of the old ones. Each can be done independently.

### 3a. Outbound Engagement → New Tables

Currently `outbound-engagement-scrape` both scrapes AND sends to Slack. Split these:

- Scraping is now handled by `linkedin-sync-profile`
- Create a new task or modify existing: after sync completes, check for new posts on profiles with `outbound_enabled=true`, claim them (pending→sending), send Slack cards
- This could be a second step in `linkedin-sync-profile` or a separate `linkedin-outbound-notify` task triggered after sync
- `engagement-slack-action` updates `linkedin_posts` instead of `engagementPosts`

**Tasks:**

- [x] New outbound notification logic reading from `linkedin_posts`
- [x] Update `engagement-slack-action` to use `linkedin_posts`
- [x] Update `/api/engagement-slack/route.ts` (already compatible — passes postId with prefix routing)
- [x] Update engagement API routes (`/api/accounts/[id]/engagement/*`) to read from new tables
- [x] Update UI components that display engagement data (engagement page + Zod schemas)

### 3b. Analytics → New Tables

Currently `weekly-analytics` scrapes + generates report. Split:

- Scraping is now handled by `linkedin-sync-profile` (every 30 min instead of weekly)
- `weekly-analytics-scheduler` triggers report generation only, reading from `linkedin_posts` and `linkedin_post_snapshots`
- `analytics-report.ts` / `analytics-pipeline.ts` query new tables

**Tasks:**

- [x] Update `analytics-pipeline.ts` to skip scraping, read from `linkedin_posts`/`linkedin_post_snapshots`
- [x] Update `analytics-report.ts` to query new tables
- [x] Update analytics API routes (`/api/accounts/[id]/analytics/*`) to use `linkedin_profiles`
- [x] Update `post-tracker.ts` to write to `linkedin_posts`/`linkedin_post_snapshots`
- [x] Drop FK from `analyticsReports.profileId` → `managedProfiles` (migration `0022_clean_mandarin.sql`)

### 3c. Unreplied Comment Alerts (NEW FEATURE)

After each sync, check for comments that need attention:

- Query `linkedin_post_comments` where `replied_to_by_owner = false` AND `is_reply = false` (top-level only) AND `notified_at IS NULL` AND `commented_at` within last 7 days
- Group by post, send a Slack notification to the account's `analyticsSlackChannel`: "N unreplied comments on [post snippet]" with commenter names and links
- Mark notified comments with `notified_at = now()`
- Implemented as a step at the end of `linkedin-sync-profile` (for analyticsEnabled profiles)

**Tasks:**

- [x] Implement unreplied comment detection logic
- [x] Build Slack notification format (post snippet + commenter list + links)
- [x] Decide: inline in sync task (chosen — runs after comment scraping step)

### 3d. Inbound Lead Discovery → New Tables

Currently `linkedin-engagement-scrape` scrapes posts AND scrapes engagers AND upserts leads — all in one task. In the new model, the sync job handles scraping (posts, comments, engagers). Lead discovery becomes a pure data-transformation step with **no Apify calls**:

- Read from `linkedin_post_engagements` + `linkedin_post_comments` for profiles with `inbound_enabled=true`
- Deduplicate engagers across posts (same 2-pass dedup: URL-based then name-based)
- Upsert to `leads` table with merged engagement types, post URLs, and date ranges
- Triggered by `linkedin-sync-profile` after engager scraping (when windows were scraped)
- The early/late window distinction is preserved naturally — engagers scraped at ~6h populate early, ~72h populate late

**Tasks:**

- [x] Create `linkedin-lead-upsert` task (reads new tables, writes to `leads` — no Apify)
- [x] Port dedup logic from `linkedin-engagement-scrape`
- [x] Update lead-related API routes (`/api/accounts/[id]/leads/scrape`)
- [ ] Remove `engagementScrapeEnabled` from accounts/contacts (replaced by `inbound_enabled` on `linkedin_profiles`) — Phase 4

### 3e. Profile Management

- [x] Create `src/lib/linkedin-profiles.ts` — CRUD for unified profile table
- [x] Migration script: populate `linkedin_profiles` from existing `managedProfiles`, `engagementProfiles`, and accounts/contacts with `engagementScrapeEnabled`
- [x] Update API routes that create/manage profiles to use new table
- [ ] Update UI (account pages, create-contact-modal, engagement config)

---

## Phase 4: Cleanup

Once all consumers are migrated and verified:

- [ ] Remove old tables: `managedProfiles`, `managedPosts`, `managedPostSnapshots`, `engagementProfiles`, `engagementPosts`, `engagementJobs`, `engagementRawResults`
- [ ] Remove old trigger tasks: `linkedin-engagement-scheduler`, `linkedin-engagement-scrape`, `outbound-engagement-scrape`, old `weekly-analytics` scraping path
- [ ] Remove `engagementScrapeEnabled` from `accounts` and `contacts` tables
- [ ] Remove old lib code: `managed-profiles.ts`, `post-ingestion.ts` (if fully replaced)
- [ ] Update `docs/architecture.md`, `docs/design-decisions.md`
- [ ] Run `scripts/lint-architecture.sh`

---

## Risks & Considerations

- **Apify costs**: The base post feed scrape is 1 Apify call per profile per sync (same actor, same cost). The per-post calls add up:
  - **Comments**: 1 call per post ≤7 days old, per sync. Most syncs will find few new comments (30-min intervals). Could add `comments_last_scraped_at` to skip if recently scraped.
  - **Engagers (reactions + reposts)**: 2 calls per post (reactions actor + reshares actor), but only at the two windows (~6h and ~72h). Each post gets engager-scraped exactly **twice in its lifetime**, same as today. No cost increase here.
  - Net: base cost is comparable to today. Comment scraping is the new addition — mitigated by the ≤7 day cutoff.
- **Window precision**: With 30-min cron, a post's actual scrape might land anywhere in a ~30-min range around the target. E.g. a post published at 10:00 might get its early scrape at 16:00 or 16:30 (6–6.5h). The 1-hour windows (6–7h, 72–73h) provide enough buffer for the 30-min cron interval.
- **Outbound freshness**: Currently outbound posts are sent to Slack immediately after scrape. With unified sync, there'll be a slight delay between "post discovered" and "Slack card sent". Acceptable if sync runs every 30 min.
- **Data migration**: Need a one-time script to backfill `linkedin_profiles` and `linkedin_posts` from existing data to avoid losing history.
- **Engagement workflow state**: Posts mid-workflow (sent_to_slack, awaiting_action) in `engagementPosts` need careful migration to `linkedin_posts`.
