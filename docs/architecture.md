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
      org/       # Admin-only endpoints (users, secrets, calendar, knowledge)
    dashboard/   # Main UI pages
    tools/       # Tool UI pages
    org/         # Admin UI (users, secrets, calendar, knowledge)
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
- `leads` — Profiles discovered via LinkedIn/Twitter engagement scraping (with tier, scoring, enrichment fields; includes `twitterUrl` for cross-platform leads)
- `leadCsvs` — CSV snapshots of leads per profile/scrape-window, stored as text
- `icpDefinitions` — Ideal Customer Profile definitions per account (titles, industries, company sizes, signals)
- `toolRuns` — Record of all background job executions
- `accountActions` — Action items per account
- `calendarSyncState`, `calendarEvents`, `calendarEventAccounts`, `calendarEventContacts` — Calendar automation
- `linkedinProfiles` — Unified registry of all tracked LinkedIn profiles (analytics, outbound engagement, inbound lead discovery)
- `linkedinPosts` — LinkedIn posts scraped from tracked profiles (dedup key: profileId + apifyPostId)
- `linkedinPostSnapshots` — Periodic engagement metric snapshots (likes/comments/reposts) per post
- `linkedinPostComments` — Comments on recent posts, used for unreplied comment alerts
- `linkedinPostEngagements` — Reactions and reposts on posts, used for lead discovery
- `linkedinSyncRuns` — Sync job execution records per profile
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
- `alphaFeeds` — Per-ICP LinkedIn Alpha Feed config and daily post entries (sages + keywords + `dailyEntries` JSONB)
- `twitterAlphaFeeds` — Per-ICP Twitter Alpha Feed config and daily post entries; parallel to `alphaFeeds`
- `twitterProfiles` — Unified registry of all tracked Twitter profiles (feature flags: `analyticsEnabled`, `outboundEnabled`, `inboundEnabled`); parallel to `linkedinProfiles`
- `twitterPosts` — Twitter posts scraped from tracked profiles (dedup key: profileId + externalTweetId)
- `twitterPostSnapshots` — Periodic engagement metric snapshots (likes/retweets/quotes/replies/views) per tweet
- `twitterSyncRuns` — Twitter sync job execution records per profile; parallel to `linkedinSyncRuns`
- `twitterPostReplies` — Replies to recent tweets, used for unreplied reply alerts; parallel to `linkedinPostComments`
- `twitterPostEngagements` — Likes, retweets, and quote tweets on posts, used for lead discovery; parallel to `linkedinPostEngagements`

ID scheme: CUID2 with prefixes (`user_`, `acct_`, `contact_`, `lead_`, `run_`, etc.) — see `src/lib/ids.ts`.

## Background Jobs (Trigger.dev)

All tasks live in `src/trigger/`. See `TRIGGER_DETAILS.md` for SDK patterns.

**AI tasks** (triggered via API, create a `toolRuns` record):

- `linkedin-audit-generation` — Profile analysis + DOCX report
- `linkedin-post-generator` — AI content creation with voice matching
- `linkedin-to-twitter` — Repurposes LinkedIn posts into Twitter threads via Claude Agent SDK
- `twitter-audit-generation` — Twitter profile audit, parallel to `linkedin-audit-generation`; DOCX report
- `twitter-post-generator` — AI content creation for Twitter (threads + single tweets)
- `twitter-to-linkedin` — Converts Twitter threads into LinkedIn posts via Claude Agent SDK
- `sentiment-analysis-generation` — Company perception research
- `gtm-strategy-generation` — Go-to-market strategy document
- `outbound-sequence-generation` — LinkedIn outbound sequence playbook with A/B/C variants and optional capacity planning
- `seo-audit-generation` — Technical SEO audit via Seomator, produces DOCX report
- `geo-audit` — GEO (Generative Engine Optimization) audit; scores a site across 6 AI-visibility dimensions, produces DOCX report
- `growth-report-generation` — Full growth report: traffic, SEO, social, competitive benchmarking; multi-phase Apify + Claude orchestrator
- `ingest-skill` — Reads a third-party SKILL.md, implements it as a native portal tool, and opens a GitHub PR
- `implement-suggestion` — Creates GitHub PRs from user suggestions
- `alpha-feed-generate-spec` — On-demand AI task that discovers sages (thought leaders) and keywords for an ICP's Alpha Feed

**Automation tasks** (triggered via API or scheduled):

- `linkedin-sync-profile` — Unified LinkedIn profile scraping (posts, comments, engagers, snapshots)
- `linkedin-lead-upsert` — Discovers leads from post engagers and comments (no Apify calls)
- `engagement-slack-action` — Processes Slack button clicks (comment/like/repost/skip) on outbound LinkedIn engagement cards
- `twitter-sync-profile` — Unified Twitter profile scraping (tweets, replies, engagers, snapshots); parallel to `linkedin-sync-profile`
- `twitter-lead-upsert` — Discovers leads from tweet likes, retweets, and replies; parallel to `linkedin-lead-upsert`
- `twitter-engagement-slack-action` — Processes Slack button clicks on outbound Twitter engagement cards; parallel to `engagement-slack-action`
- `account-enrichment` — Company data enrichment via web search
- `weekly-analytics` — Scrapes a single managed client LinkedIn profile, generates a weekly performance report, sends to Slack (triggered by `weekly-analytics-scheduler`; concurrency-limited to 2 via queue)
- `twitter-weekly-analytics` — Twitter equivalent of `weekly-analytics`; scrapes a single Twitter profile, generates weekly report
- `track-post` — Scrapes live LinkedIn post metrics (likes/comments/reposts) after a delay, saves snapshots, and reports performance in the originating Slack thread
- `track-tweet` — Twitter equivalent of `track-post`; tracks tweet metrics and reports performance in Slack thread
- `post-categoriser` — AI-classifies uncategorised LinkedIn posts by topic (thought_leadership, case_study, domain_knowledge, etc.) using Claude Haiku; fanned out daily by `post-categoriser-scheduler`
- `twitter-post-categoriser` — AI-classifies uncategorised Twitter posts by topic; parallel to `post-categoriser`; fanned out daily by `twitter-post-categoriser-scheduler`
- `alpha-feed-collect-worker` — Scrapes LinkedIn sages and keyword searches for an ICP's Alpha Feed, stores top posts; fanned out daily by `alpha-feed-collect-scheduler`
- `twitter-alpha-feed-collect-worker` — Twitter equivalent of `alpha-feed-collect-worker`; fanned out by `twitter-alpha-feed-collect-scheduler`
- `knowledge-slack-ingest-channel` — Polls a single Slack channel for new messages and stores raw events in `knowledge_events`; fanned out every 30 min by `knowledge-slack-ingest-scheduled`
- `knowledge-resolve-media` — Fetches/transcribes media referenced in knowledge events (Google Drive links, voice notes)
- `knowledge-normalise-channel` / `knowledge-normalise-all` — LLM extracts typed knowledge units (action items, decisions, context updates, etc.) from raw events
- `knowledge-state-synthesis-on-demand` — Updates per-account living state documents (brief, open items, activity log) from knowledge units; fanned out weekly by `knowledge-state-synthesis-schedule`
- `knowledge-digest-on-demand` — Generates and sends knowledge digest as Slack DMs to relevant users; fanned out daily by `knowledge-digest-schedule`

**Scheduled tasks:**

- `calendar-sync` — Google Calendar incremental sync (every 30 min, 7am–10pm London)
- `calendar-meeting-notifier` — Meeting prep notifications (every 30 min, 6am–9pm London)
- `linkedin-sync-scheduler` — Every 2 hours: fans out `linkedin-sync-profile` for all active LinkedIn profiles
- `twitter-sync-scheduler` — Every 4 hours: fans out `twitter-sync-profile` for all active Twitter profiles
- `weekly-analytics-scheduler` — Monday 7 AM UTC: fans out `weekly-analytics` for every analytics-enabled LinkedIn profile
- `twitter-weekly-analytics-scheduler` — Monday 7 AM UTC: fans out `twitter-weekly-analytics` for every analytics-enabled Twitter profile
- `post-categoriser-scheduler` — Daily 7 AM London: fans out `post-categoriser` for all uncategorised LinkedIn posts
- `twitter-post-categoriser-scheduler` — Daily: fans out `twitter-post-categoriser` for all uncategorised tweets
- `alpha-feed-collect-scheduler` — Daily: fans out `alpha-feed-collect-worker` for all active LinkedIn Alpha Feeds
- `twitter-alpha-feed-collect-scheduler` — Daily: fans out `twitter-alpha-feed-collect-worker` for all active Twitter Alpha Feeds
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
