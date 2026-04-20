# Architecture

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Next.js API routes (deployed on Vercel)
- **Database:** PostgreSQL 16 (Docker locally, Neon in production) via Drizzle ORM
- **Background Jobs:** Trigger.dev v4 (cloud-hosted worker)
- **AI:** Anthropic Claude via `@anthropic-ai/claude-agent-sdk`
- **Auth:** NextAuth 5 (Google OAuth, restricted to @mvrxlabs.com)
- **External:** Apify (LinkedIn + Twitter scraping), Google Drive/Calendar APIs, Slack webhooks

## Directory Structure

```
src/
  app/           # Next.js App Router (pages + API routes)
    api/         # API endpoints (REST)
      tools/     # Endpoints that trigger background jobs
      admin/     # Admin-only endpoints
    dashboard/   # Main UI pages
    tools/       # Tool UI pages
    admin/       # Admin UI
  trigger/       # Trigger.dev background tasks
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
- `leads` — People discovered via engagement scraping (LinkedIn or Twitter; with tier, scoring, enrichment fields)
- `leadCsvs` — CSV snapshots of leads per profile/scrape-window, stored as text
- `icpDefinitions` — Ideal Customer Profile definitions per account (titles, industries, company sizes, signals)
- `alphaFeeds` — LinkedIn alpha feed config per ICP (sages, keywords, daily scraped entries stored as JSONB)
- `twitterAlphaFeeds` — Twitter alpha feed config per ICP (same structure as `alphaFeeds`)
- `toolRuns` — Record of all background job executions
- `accountActions` — Action items per account
- `calendarSyncState`, `calendarEvents`, `calendarEventAccounts`, `calendarEventContacts` — Calendar automation
- `linkedinProfiles` — Unified registry of all tracked LinkedIn profiles (analytics, outbound engagement, inbound lead discovery)
- `linkedinPosts` — LinkedIn posts scraped from tracked profiles (dedup key: profileId + apifyPostId)
- `linkedinPostSnapshots` — Periodic engagement metric snapshots (likes/comments/reposts) per post
- `linkedinPostComments` — Comments on recent posts, used for unreplied comment alerts
- `linkedinPostEngagements` — Reactions and reposts on posts, used for lead discovery
- `linkedinSyncRuns` — Sync job execution records per LinkedIn profile
- `twitterProfiles` — Twitter/X profiles registry with feature flags (`analytics_enabled`, `outbound_enabled`, `inbound_enabled`); mirrors `linkedinProfiles`
- `twitterPosts` — Tweets scraped from tracked profiles (dedup key: profileId + externalTweetId)
- `twitterPostSnapshots` — Periodic engagement metric snapshots per tweet
- `twitterPostReplies` — Replies on recent tweets, used for unreplied reply alerts (mirrors `linkedinPostComments`)
- `twitterPostEngagements` — Reactions and retweets on tweets, used for lead discovery
- `twitterSyncRuns` — Sync job execution records per Twitter profile
- `analyticsReports` — Generated weekly analytics reports, with PDF URL and Slack message TS
- `apifyCache` — Deduplication cache for Apify actor results (keyed by actor + input hash, with TTL)
- `secretTypes` — Credential type registry (e.g. "Apollo API Key", "HeyReach Token")
- `secrets` — Stored credentials per account/contact, linked to a secret type
- `knowledgeChannels` — Slack channel to account mapping (shared vs. internal, with channel category)
- `knowledgeSyncState` — Per-channel Slack sync cursor (last message timestamp)
- `knowledgeEvents` — Append-only log of raw events from all knowledge sources (Slack, Drive, etc.)
- `knowledgeUnits` — LLM-extracted, typed knowledge items (action_item, decision, context_update, request, feedback, deliverable, blocker)
- `knowledgeState` — Per-account living state documents (brief, open_items, activity_log); one row per type per account
- `knowledgeDigestMessages` — Tracks Slack DM digest messages per unit/recipient for done/undone marking

ID scheme: CUID2 with prefixes (`user_`, `acct_`, `contact_`, `lead_`, `run_`, etc.) — see `src/lib/ids.ts`.

## Background Jobs (Trigger.dev)

All tasks live in `src/trigger/`. See `TRIGGER_DETAILS.md` for SDK patterns.

**AI tasks** (triggered via API, create a `toolRuns` record):

- `linkedin-audit-generation` — LinkedIn profile analysis + DOCX report
- `linkedin-post-generator` — AI LinkedIn content creation with voice matching
- `linkedin-to-twitter` — Repurposes LinkedIn posts into Twitter threads via Claude Agent SDK
- `twitter-audit-generation` — Twitter/X profile audit + DOCX report
- `twitter-post-generator` — AI Twitter content creation
- `twitter-to-linkedin` — Converts tweets into LinkedIn posts via Claude Agent SDK
- `alpha-feed-generate-spec` — On-demand AI task that discovers sages and keywords for an ICP's alpha feed (LinkedIn + Twitter)
- `sentiment-analysis-generation` — Company perception research
- `gtm-strategy-generation` — Go-to-market strategy document
- `outbound-sequence-generation` — LinkedIn outbound sequence playbook with A/B/C variants and optional capacity planning
- `seo-audit-generation` — Technical SEO audit via Seomator, produces DOCX report
- `geo-audit` — GEO (Generative Engine Optimization) audit; scores a site across 6 AI-visibility dimensions, produces DOCX report
- `growth-report-generation` — Full growth report: traffic, SEO, social, competitive benchmarking; multi-phase Apify + Claude orchestrator
- `ingest-skill` — Reads a third-party SKILL.md, implements it as a native portal tool, and opens a GitHub PR
- `implement-suggestion` — Creates GitHub PRs from user suggestions

**Automation tasks** (triggered via API or scheduled):

- `linkedin-sync-profile` — Unified LinkedIn profile scraping (posts, comments, engagers, snapshots)
- `linkedin-lead-upsert` — Discovers leads from LinkedIn post engagers and comments (no Apify calls)
- `engagement-slack-action` — Processes Slack button clicks (comment/like/repost/skip) on LinkedIn outbound engagement cards
- `twitter-sync-profile` — Unified Twitter profile scraping (tweets, replies, engagers, snapshots)
- `twitter-lead-upsert` — Discovers leads from Twitter post engagers (no Apify calls)
- `twitter-engagement-slack-action` — Processes Slack button clicks on Twitter outbound engagement cards
- `alpha-feed-collect-worker` — Scrapes LinkedIn sages and keyword searches for the alpha feed; fanned out daily by `alpha-feed-collect-scheduler`
- `twitter-alpha-feed-collect-worker` — Scrapes Twitter sages and keyword searches for the alpha feed; fanned out daily by `twitter-alpha-feed-collect-scheduler`
- `account-enrichment` — Company data enrichment via web search
- `weekly-analytics` — Scrapes a single managed client LinkedIn profile, generates a weekly performance report, sends to Slack (triggered by `weekly-analytics-scheduler`; concurrency-limited to 2 via queue)
- `twitter-weekly-analytics` — Scrapes a single managed client Twitter profile, generates a weekly performance report, sends to Slack (triggered by `twitter-weekly-analytics-scheduler`)
- `track-post` — Scrapes live LinkedIn post metrics (likes/comments/reposts) after a delay, saves snapshots, and reports performance in the originating Slack thread
- `track-tweet` — Scrapes live Twitter post metrics after a delay, saves snapshots, and reports performance in the originating Slack thread
- `post-categoriser` — AI-classifies uncategorised LinkedIn posts by topic (thought_leadership, case_study, domain_knowledge, etc.) using Claude Haiku; fanned out daily by `post-categoriser-scheduler`
- `twitter-post-categoriser` — AI-classifies uncategorised tweets by topic; fanned out daily by `twitter-post-categoriser-scheduler`
- `knowledge-slack-ingest-channel` — Polls a single Slack channel for new messages and stores raw events in `knowledge_events`; fanned out every 30 min by `knowledge-slack-ingest-scheduled`
- `knowledge-resolve-media` — Fetches/transcribes media referenced in knowledge events (Google Drive links, voice notes)
- `knowledge-normalise-channel` / `knowledge-normalise-all` — LLM extracts typed knowledge units (action items, decisions, context updates, etc.) from raw events
- `knowledge-state-synthesis-on-demand` — Updates per-account living state documents (brief, open items, activity log) from knowledge units; fanned out weekly by `knowledge-state-synthesis-schedule`
- `knowledge-digest-on-demand` — Generates and sends knowledge digest as Slack DMs to relevant users; fanned out daily by `knowledge-digest-schedule`

**Scheduled tasks:**

- `calendar-sync` — Google Calendar incremental sync (every 30 min, 7am–10pm London)
- `calendar-meeting-notifier` — Meeting prep notifications (every 30 min, 6am–9pm London)
- `linkedin-sync-scheduler` — Every 2 hours: fans out `linkedin-sync-profile` for all active LinkedIn profiles
- `twitter-sync-scheduler` — Every 2 hours: fans out `twitter-sync-profile` for all active Twitter profiles
- `weekly-analytics-scheduler` — Monday 7 AM UTC: fans out `weekly-analytics` tasks for every analytics-enabled LinkedIn profile
- `twitter-weekly-analytics-scheduler` — Monday 7 AM UTC: fans out `twitter-weekly-analytics` for every analytics-enabled Twitter profile
- `post-categoriser-scheduler` — Daily 7 AM London: fans out `post-categoriser` for all uncategorised LinkedIn posts
- `twitter-post-categoriser-scheduler` — Daily: fans out `twitter-post-categoriser` for all uncategorised tweets
- `alpha-feed-collect-scheduler` — Daily: fans out `alpha-feed-collect-worker` for all active LinkedIn alpha feeds
- `twitter-alpha-feed-collect-scheduler` — Daily: fans out `twitter-alpha-feed-collect-worker` for all active Twitter alpha feeds
- `knowledge-slack-ingest-scheduled` — Every 30 min (Mon–Fri, 8am–10pm London): fans out `knowledge-slack-ingest-channel` for all active channels
- `knowledge-state-synthesis-schedule` — Monday 8 AM London: fans out `knowledge-state-synthesis-on-demand` for all active accounts
- `knowledge-digest-schedule` — Mon–Fri 9 AM London: fans out `knowledge-digest-on-demand` per user
- `idea-generator` — Daily 9 AM London (Mon–Fri) AI-driven idea bot: generates a product idea, implements it, opens a PR (currently disabled)
- `code-quality-scan` — Weekly doc gardening: Claude audits docs vs code, opens PR for drift

**Patterns:**

- All tasks use `logger` from `@trigger.dev/sdk` (not `console.log`)
- All tasks send Slack notifications on failure via `src/lib/slack.ts`
- Progress tracked via `metadata` (visible in Trigger.dev dashboard and frontend)
- Retry: 3 attempts with exponential backoff (configured in `trigger.config.ts`)
