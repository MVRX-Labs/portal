# Trigger Task Inventory

Last updated: 2026-04-20

## Scheduled (Cron) Tasks

### LinkedIn

| File | Task ID(s) | Schedule |
| ---- | ---------- | -------- |
| `linkedin-sync.ts` | `linkedin-sync-scheduler` → `linkedin-sync-profile` | Every 2h |
| `linkedin-analytics-scrape.ts` | `weekly-analytics-scheduler` → `weekly-analytics` | Monday 7 AM UTC |
| `linkedin-post-categoriser.ts` | `post-categoriser-scheduler` → `post-categoriser` | Daily 7 AM London |
| `alpha-feed.ts` | `alpha-feed-collect-scheduler` → `alpha-feed-collect-worker` | Daily |

### Twitter/X

| File | Task ID(s) | Schedule |
| ---- | ---------- | -------- |
| `twitter-sync.ts` | `twitter-sync-scheduler` → `twitter-sync-profile` | Every 2h |
| `twitter-analytics-scrape.ts` | `twitter-weekly-analytics-scheduler` → `twitter-weekly-analytics` | Monday 7 AM UTC |
| `twitter-post-categoriser.ts` | `twitter-post-categoriser-scheduler` → `twitter-post-categoriser` | Daily |
| `twitter-alpha-feed.ts` | `twitter-alpha-feed-collect-scheduler` → `twitter-alpha-feed-collect-worker` | Daily |

### Calendar

| File | Task ID | Schedule |
| ---- | ------- | -------- |
| `calendar-sync.ts` | `calendar-sync` | Every 30 min, 7–22 London |
| `calendar-meeting-notifier.ts` | `calendar-meeting-notifier` | :25 & :55 past hours 6–21 London |

### Knowledge System

| File | Task ID(s) | Schedule |
| ---- | ---------- | -------- |
| `knowledge-slack-ingest.ts` | `knowledge-slack-ingest-scheduled` → `knowledge-slack-ingest-channel` | Every 30 min, Mon–Fri 8–22 London |
| `knowledge-state-synthesis.ts` | `knowledge-state-synthesis-schedule` | Monday 8 AM London |
| `knowledge-digest.ts` | `knowledge-digest-schedule` | Weekdays 9 AM London |

### Internal

| File | Task ID | Schedule |
| ---- | ------- | -------- |
| `idea-generator.ts` | `idea-generator` | **Disabled** (was weekdays 9 AM London) |
| `code-quality-scan.ts` | `code-quality-scan` | Weekly |

---

## On-Demand Tasks

### Client Deliverables (DOCX → Google Drive)

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `linkedin-audit.ts` | `linkedin-audit-generation` | LinkedIn profile audit report |
| `twitter-audit.ts` | `twitter-audit-generation` | Twitter/X profile audit report |
| `growth-report.ts` | `growth-report-generation` | SEO & growth report (12+ sources) |
| `seo-audit.ts` | `seo-audit-generation` | SEOmator-based website audit |
| `sentiment-analysis.ts` | `sentiment-analysis-generation` | Product sentiment from Reddit/reviews/web |
| `gtm-strategy.ts` | `gtm-strategy-generation` | GTM strategy with competitive analysis |
| `outbound-sequence.ts` | `outbound-sequence-generation` | LinkedIn outbound sequence playbook |
| `geo-audit.ts` | `geo-audit` | GEO audit across 6 AI-visibility dimensions |

### LinkedIn Content

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `linkedin-post-generator.ts` | `linkedin-post-generator` | Generates LinkedIn post variations from source material |
| `linkedin-to-twitter.ts` | `linkedin-to-twitter` | Converts LinkedIn post to tweet/thread |

### Twitter/X Content

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `twitter-post-generator.ts` | `twitter-post-generator` | Generates Twitter post variations |
| `twitter-to-linkedin.ts` | `twitter-to-linkedin` | Converts tweet to LinkedIn post |

### Alpha Feed

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `alpha-feed.ts` | `alpha-feed-generate-spec` | AI discovers sages + keywords for an ICP's LinkedIn alpha feed |

### LinkedIn Engagement

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `linkedin-engagement-slack-action.ts` | `engagement-slack-action` | Handles Slack button clicks (comment/like/repost/skip) |
| `linkedin-lead-upsert.ts` | `linkedin-lead-upsert` | Upserts leads from engagement scraping, dedupes, sends to Slack |
| `linkedin-post-tracker.ts` | `track-post` | Scrapes post metrics after delay, reports to Slack thread |

### Twitter/X Engagement

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `twitter-engagement-slack-action.ts` | `twitter-engagement-slack-action` | Handles Slack button clicks for Twitter outbound |
| `twitter-lead-upsert.ts` | `twitter-lead-upsert` | Upserts leads from Twitter engagement scraping |
| `twitter-post-tracker.ts` | `track-tweet` | Scrapes tweet metrics after delay, reports to Slack thread |

### Knowledge System (on-demand)

| File | Task ID(s) | Description |
| ---- | ---------- | ----------- |
| `knowledge-resolve.ts` | `knowledge-resolve-media` | Resolves voice notes (Whisper) and Drive links |
| `knowledge-normalise.ts` | `knowledge-normalise-channel` / `knowledge-normalise-all` | LLM extraction of typed knowledge units |
| `knowledge-digest.ts` | `knowledge-digest-on-demand` | Manual trigger for daily digest |
| `knowledge-state-synthesis.ts` | `knowledge-state-synthesis-on-demand` | Manual trigger for state synthesis |

### Internal Tooling

| File | Task ID | Description |
| ---- | ------- | ----------- |
| `account-enrichment.ts` | `account-enrichment` | Enriches company accounts (domain research, LinkedIn URL) |
| `implement-suggestion.ts` | `implement-suggestion` | Implements user suggestions via Claude, creates PR |
| `ingest-skill.ts` | `ingest-skill` | Analyzes + implements third-party Claude Skills as native tools |
| `screenshot-test.ts` | `screenshot-test` | Standalone screenshot capture utility (dev/test) |

---

## Prompt-Only Files (no task export)

These files export prompt helpers used by task files — they define no Trigger tasks:

- `alpha-feed-prompts.ts`
- `idea-generator-prompts.ts`
- `ingest-skill-prompts.ts`
- `linkedin-hook-templates.ts`

---

## Task Chains

- **linkedin-sync-scheduler** → `linkedin-sync-profile` → `linkedin-lead-upsert`
- **twitter-sync-scheduler** → `twitter-sync-profile` → `twitter-lead-upsert`
- **weekly-analytics-scheduler** → `weekly-analytics` (batch, concurrency-limited)
- **twitter-weekly-analytics-scheduler** → `twitter-weekly-analytics`
- **post-categoriser-scheduler** → `post-categoriser`
- **twitter-post-categoriser-scheduler** → `twitter-post-categoriser`
- **alpha-feed-collect-scheduler** → `alpha-feed-collect-worker`
- **twitter-alpha-feed-collect-scheduler** → `twitter-alpha-feed-collect-worker`
- **knowledge-slack-ingest-scheduled** → `knowledge-slack-ingest-channel` → `knowledge-resolve-media` → `knowledge-normalise-all` / `knowledge-normalise-channel`
- **calendar-sync** → `account-enrichment` (for new accounts discovered via calendar)
