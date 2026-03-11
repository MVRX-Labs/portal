# Architecture

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Next.js API routes (deployed on Vercel)
- **Database:** PostgreSQL 16 (Docker locally, Neon in production) via Drizzle ORM
- **Background Jobs:** Trigger.dev v4 (cloud-hosted worker)
- **AI:** Anthropic Claude via `@anthropic-ai/claude-agent-sdk`
- **Auth:** NextAuth 5 (Google OAuth, restricted to @mvrxlabs.com)
- **External:** Apify (LinkedIn scraping), Google Drive/Calendar APIs, Slack webhooks

## Directory Structure

```
src/
  app/           # Next.js App Router (pages + API routes)
    api/         # API endpoints (REST)
      tools/     # Endpoints that trigger background jobs
      admin/     # Admin-only endpoints
      hooks/     # Webhooks (job completion callbacks)
    dashboard/   # Main UI pages
    tools/       # Tool UI pages
    admin/       # Admin UI
  trigger/       # Trigger.dev background tasks (18 task IDs across 17 task files)
  components/    # React components
  lib/           # Shared utilities, DB schema, API clients
scripts/         # Dev scripts (seed, migrations, pre-commit hooks)
docs/            # Project documentation (you are here)
```

## Dependency Layers

Code flows in one direction. Violations are caught by `scripts/lint-architecture.sh`.

```
lib/          Shared utilities, DB, types, API clients
  |
  v
trigger/      Background tasks (import from lib/, never from app/)
  |
  v
app/api/      API routes (import from lib/, trigger tasks via SDK)
  |
  v
app/pages     UI pages (call API routes, never import trigger/ directly)
components/   React components (call API routes, never import trigger/ directly)
```

**Rules:**

- `trigger/` must NOT import from `app/` — trigger tasks run in Trigger.dev's runtime, not Next.js
- `lib/` must NOT import from `trigger/` — lib is lower-level shared code
- `components/` and `app/` pages must NOT import from `trigger/` — UI interacts with background jobs via API routes only
- Cross-cutting concerns (Slack, Google Drive, DB) live in `lib/`

## Database

Schema defined in `src/lib/schema.ts` using Drizzle ORM. Key tables:

- `users` — Portal users (Google OAuth)
- `accounts` — Companies being tracked (with MRR, engagement settings)
- `contacts` — People at companies (linked to accounts)
- `leads` — LinkedIn profiles from engagement scraping
- `toolRuns` — Record of all background job executions
- `accountActions` — Action items per account
- `calendarSyncState`, `calendarEvents`, `calendarEventAccounts`, `calendarEventContacts` — Calendar automation
- `engagementProfiles` — LinkedIn profiles tracked for outbound engagement (per account)
- `engagementPosts` — Scraped LinkedIn posts pending/actioned review
- `engagementJobs` — Apify scrape job records for engagement profiles
- `engagementRawResults` — Raw Apify output per job (dedup key: profileId + apifyItemId)
- `managedProfiles` — Our clients' LinkedIn profiles tracked for analytics (distinct from `engagementProfiles` which tracks external targets)
- `managedPosts` — LinkedIn posts scraped from managed profiles (dedup key: profileId + apifyPostId)
- `managedPostSnapshots` — Periodic engagement metric snapshots (likes/comments/reposts) per managed post
- `analyticsReports` — Generated weekly analytics reports, with PDF URL and Slack message TS

ID scheme: CUID2 with prefixes (`user_`, `acct_`, `contact_`, `lead_`, `run_`, etc.) — see `src/lib/ids.ts`.

## Background Jobs (Trigger.dev)

All tasks live in `src/trigger/`. See `TRIGGER_DETAILS.md` for SDK patterns.

**AI tasks** (triggered via API, create a `toolRuns` record):

- `linkedin-audit-generation` — Profile analysis + DOCX report
- `linkedin-post-generator` — AI content creation with voice matching
- `linkedin-humanizer` — Tone refinement
- `sentiment-analysis-generation` — Company perception research
- `gtm-strategy-generation` — Go-to-market strategy document
- `implement-suggestion` — Creates GitHub PRs from user suggestions

**Automation tasks** (triggered via API or scheduled):

- `linkedin-engagement-scrape` — Lead discovery from company/personal engagement
- `outbound-engagement-scrape` — Scrapes recent LinkedIn posts for tracked profiles, sends to Slack for review
- `engagement-slack-action` — Processes Slack button clicks (comment/like/repost/skip) on outbound engagement cards
- `account-enrichment` — Company data enrichment via web search
- `weekly-analytics` — Scrapes a single managed client LinkedIn profile, generates a weekly performance report, sends to Slack (triggered by `weekly-analytics-scheduler`; concurrency-limited to 2 via queue)
- `track-post` — Scrapes live LinkedIn post metrics (likes/comments/reposts) after a delay, saves snapshots, and reports performance in the originating Slack thread

**Scheduled tasks:**

- `calendar-sync` — Google Calendar incremental sync (every 30 min, 7am–10pm London)
- `calendar-meeting-notifier` — Meeting prep notifications
- `linkedin-engagement-scheduler` — Periodic engagement scraping
- `weekly-analytics-scheduler` — Monday 7 AM UTC: fans out `weekly-analytics` tasks for every active managed profile
- `idea-generator` — Hourly AI-driven idea bot: generates a product idea, implements it, opens a PR (Mon–Fri, 9am–5pm London)
- `code-quality-scan` — Weekly doc gardening: Claude audits docs vs code, opens PR for drift

**Patterns:**

- All tasks use `logger` from `@trigger.dev/sdk` (not `console.log`)
- All tasks send Slack notifications on failure via `src/lib/slack.ts`
- Progress tracked via `metadata` (visible in Trigger.dev dashboard and frontend)
- Retry: 3 attempts with exponential backoff (configured in `trigger.config.ts`)
