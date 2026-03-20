# Trigger Task Inventory

Last updated: 2026-03-20

## Scheduled (Cron) Tasks

### LinkedIn

| Task                  | ID                                                  | Schedule          |
| --------------------- | --------------------------------------------------- | ----------------- |
| `linkedin-sync.ts`    | `linkedin-sync-scheduler` → `linkedin-sync-profile` | Every 2h at :05   |
| `post-categoriser.ts` | `post-categoriser-scheduler` → `post-categoriser`   | Daily 7:15 AM UTC |

### Calendar

| Task                           | ID                          | Schedule                           |
| ------------------------------ | --------------------------- | ---------------------------------- |
| `calendar-sync.ts`             | `calendar-sync`             | Every 30 min, 7-22 UTC             |
| `calendar-meeting-notifier.ts` | `calendar-meeting-notifier` | :25 & :55 past hours 6-21 (London) |

### Knowledge System

| Task                           | ID                                                                    | Schedule                   |
| ------------------------------ | --------------------------------------------------------------------- | -------------------------- |
| `knowledge-slack-ingest.ts`    | `knowledge-slack-ingest-scheduled` → `knowledge-slack-ingest-channel` | Every 30 min, 8-22 Mon-Fri |
| `knowledge-state-synthesis.ts` | `knowledge-state-synthesis-schedule`                                  | Monday 8 AM UTC            |
| `knowledge-digest.ts`          | `knowledge-digest-schedule`                                           | Weekdays 9 AM UTC          |

### Analytics & Internal

| Task                   | ID                                                | Schedule                         |
| ---------------------- | ------------------------------------------------- | -------------------------------- |
| `analytics-scrape.ts`  | `weekly-analytics-scheduler` → `weekly-analytics` | Monday 7 AM UTC                  |
| `code-quality-scan.ts` | `code-quality-scan`                               | Monday 8 AM UTC                  |
| `idea-generator.ts`    | `idea-generator`                                  | **Disabled** (was weekdays 9 AM) |

## On-Demand Tasks

### Client Deliverables (DOCX → Google Drive)

| Task                    | ID                              | Description                                    |
| ----------------------- | ------------------------------- | ---------------------------------------------- |
| `linkedin-audit.ts`     | `linkedin-audit-generation`     | Full LinkedIn profile audit report             |
| `growth-report.ts`      | `growth-report-generation`      | SEO & growth report (12+ sources, screenshots) |
| `seo-audit.ts`          | `seo-audit-generation`          | SEOmator-based website audit                   |
| `sentiment-analysis.ts` | `sentiment-analysis-generation` | Product sentiment from Reddit/reviews/web      |
| `gtm-strategy.ts`       | `gtm-strategy-generation`       | GTM strategy with competitive analysis         |
| `outbound-sequence.ts`  | `outbound-sequence-generation`  | LinkedIn outbound sequence playbook            |

### LinkedIn Content

| Task                         | ID                        | Description                                      |
| ---------------------------- | ------------------------- | ------------------------------------------------ |
| `linkedin-post-generator.ts` | `linkedin-post-generator` | Generates 3 post variations from source material |
| `linkedin-humanizer.ts`      | `linkedin-humanizer`      | Rewrites AI-generated posts to sound human       |
| `linkedin-to-twitter.ts`     | `linkedin-to-twitter`     | Converts LinkedIn post to tweet/thread           |

### LinkedIn Engagement

| Task                         | ID                        | Description                                               |
| ---------------------------- | ------------------------- | --------------------------------------------------------- |
| `engagement-slack-action.ts` | `engagement-slack-action` | Handles Slack button actions (comment/like/repost/skip)   |
| `linkedin-lead-upsert.ts`    | `linkedin-lead-upsert`    | Upserts leads from engagement, dedupes, sends to Slack    |
| `post-tracker.ts`            | `track-post`              | Scrapes post metrics after delay, reports to Slack thread |

### Knowledge System (on-demand counterparts)

| Task                           | ID                                                        | Description                                    |
| ------------------------------ | --------------------------------------------------------- | ---------------------------------------------- |
| `knowledge-resolve.ts`         | `knowledge-resolve-media`                                 | Resolves voice notes (Whisper) and Drive links |
| `knowledge-normalise.ts`       | `knowledge-normalise-channel` / `knowledge-normalise-all` | LLM extraction of typed knowledge units        |
| `knowledge-digest.ts`          | `knowledge-digest-on-demand`                              | Manual trigger for daily digest                |
| `knowledge-state-synthesis.ts` | `knowledge-state-synthesis-on-demand`                     | Manual trigger for state synthesis             |

### Internal Tooling

| Task                      | ID                     | Description                                                     |
| ------------------------- | ---------------------- | --------------------------------------------------------------- |
| `account-enrichment.ts`   | `account-enrichment`   | Enriches company accounts (domain research, LinkedIn URL)       |
| `implement-suggestion.ts` | `implement-suggestion` | Implements user suggestions via Claude, creates PR              |
| `ingest-skill.ts`         | `ingest-skill`         | Analyzes + implements third-party Claude Skills as native tools |
| `screenshot-test.ts`      | `screenshot-test`      | Standalone screenshot capture utility                           |

## Task Chains

Some tasks trigger others:

- **calendar-sync** → `account-enrichment` (for new accounts)
- **linkedin-sync-scheduler** → `linkedin-sync-profile` → `linkedin-lead-upsert`
- **knowledge-slack-ingest** → `knowledge-resolve-media` → `knowledge-normalise-all` → `knowledge-normalise-channel`
- **post-categoriser-scheduler** → `post-categoriser`
- **weekly-analytics-scheduler** → `weekly-analytics` (batch)

## Summary

**28 task definitions** total: 10 scheduled, 18 on-demand. 16 use Claude Agent SDK, 4 use the Anthropic API directly.
