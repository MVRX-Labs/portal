# Trigger Task Inventory

Last updated: 2026-05-11

## Scheduled (Cron) Tasks

### LinkedIn

| Task                                | ID                                                  | Schedule          |
| ----------------------------------- | --------------------------------------------------- | ----------------- |
| `linkedin-sync.ts`                  | `linkedin-sync-scheduler` → `linkedin-sync-profile` | Every 2h at :05   |
| `linkedin-post-categoriser.ts`      | `post-categoriser-scheduler` → `post-categoriser`   | Daily 7:15 AM UTC |
| `linkedin-analytics-scrape.ts`      | `weekly-analytics-scheduler` → `weekly-analytics`   | Monday 7 AM UTC   |
| `alpha-feed.ts`                     | `alpha-feed-collect-scheduler` → `alpha-feed-collect-worker` | Daily             |

### Twitter/X

| Task                                | ID                                                                  | Schedule             |
| ----------------------------------- | ------------------------------------------------------------------- | -------------------- |
| `twitter-sync.ts`                   | `twitter-sync-scheduler` → `twitter-sync-profile`                  | Every 4h             |
| `twitter-post-categoriser.ts`       | `twitter-post-categoriser-scheduler` → `twitter-post-categoriser`  | Daily                |
| `twitter-analytics-scrape.ts`       | `twitter-weekly-analytics-scheduler` → `twitter-weekly-analytics`  | Monday 7:30 AM UTC   |
| `twitter-alpha-feed.ts`             | `twitter-alpha-feed-collect-scheduler` → `twitter-alpha-feed-collect-worker` | Daily     |

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

### Internal

| Task                   | ID                  | Schedule                         |
| ---------------------- | ------------------- | -------------------------------- |
| `code-quality-scan.ts` | `code-quality-scan` | Monday 8 AM UTC                  |
| `idea-generator.ts`    | `idea-generator`    | **Disabled** (was weekdays 9 AM) |

## On-Demand Tasks

### Client Deliverables (DOCX → Google Drive)

| Task                    | ID                              | Description                                    |
| ----------------------- | ------------------------------- | ---------------------------------------------- |
| `linkedin-audit.ts`     | `linkedin-audit-generation`     | Full LinkedIn profile audit report             |
| `twitter-audit.ts`      | `twitter-audit-generation`      | Full Twitter/X profile audit report            |
| `growth-report.ts`      | `growth-report-generation`      | SEO & growth report (12+ sources, screenshots) |
| `seo-audit.ts`          | `seo-audit-generation`          | SEOmator-based website audit                   |
| `sentiment-analysis.ts` | `sentiment-analysis-generation` | Product sentiment from Reddit/reviews/web      |
| `gtm-strategy.ts`       | `gtm-strategy-generation`       | GTM strategy with competitive analysis         |
| `outbound-sequence.ts`  | `outbound-sequence-generation`  | LinkedIn outbound sequence playbook            |

### LinkedIn Content

| Task                         | ID                        | Description                                      |
| ---------------------------- | ------------------------- | ------------------------------------------------ |
| `linkedin-post-generator.ts` | `linkedin-post-generator` | Generates 3 post variations from source material |
| `linkedin-to-twitter.ts`     | `linkedin-to-twitter`     | Converts LinkedIn post to tweet/thread           |

### Twitter/X Content

| Task                         | ID                        | Description                                      |
| ---------------------------- | ------------------------- | ------------------------------------------------ |
| `twitter-post-generator.ts`  | `twitter-post-generator`  | Generates Twitter post variations from source material |
| `twitter-to-linkedin.ts`     | `twitter-to-linkedin`     | Converts Twitter thread to LinkedIn post         |

### LinkedIn Engagement

| Task                                  | ID                        | Description                                               |
| ------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `linkedin-engagement-slack-action.ts` | `engagement-slack-action` | Handles Slack button actions (comment/like/repost/skip)   |
| `linkedin-lead-upsert.ts`             | `linkedin-lead-upsert`    | Upserts leads from LinkedIn engagement, dedupes, notifies |
| `linkedin-post-tracker.ts`            | `track-post`              | Scrapes LinkedIn post metrics after delay, reports to Slack thread |

### Twitter/X Engagement

| Task                                 | ID                              | Description                                               |
| ------------------------------------ | ------------------------------- | --------------------------------------------------------- |
| `twitter-engagement-slack-action.ts` | `twitter-engagement-slack-action` | Handles Slack button actions (reply/like/retweet/skip)  |
| `twitter-lead-upsert.ts`             | `twitter-lead-upsert`           | Upserts leads from Twitter engagement, dedupes, notifies  |
| `twitter-post-tracker.ts`            | `track-tweet`                   | Scrapes tweet metrics after delay, reports to Slack thread |

### Alpha Feed

| Task                 | ID                          | Description                                               |
| -------------------- | --------------------------- | --------------------------------------------------------- |
| `alpha-feed.ts`      | `alpha-feed-generate-spec`  | AI discovers sages and keywords for an ICP's LinkedIn+Twitter alpha feed |
| `alpha-feed.ts`      | `alpha-feed-collect-worker` | Scrapes posts from LinkedIn sages + keyword searches for one ICP feed |
| `twitter-alpha-feed.ts` | `twitter-alpha-feed-collect-worker` | Scrapes tweets from Twitter sages + keyword searches for one ICP feed |

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
- **twitter-sync-scheduler** → `twitter-sync-profile` → `twitter-lead-upsert`
- **knowledge-slack-ingest** → `knowledge-resolve-media` → `knowledge-normalise-all` → `knowledge-normalise-channel`
- **post-categoriser-scheduler** → `post-categoriser`
- **twitter-post-categoriser-scheduler** → `twitter-post-categoriser`
- **weekly-analytics-scheduler** → `weekly-analytics` (batch, concurrency-limited to 2)
- **twitter-weekly-analytics-scheduler** → `twitter-weekly-analytics` (batch, concurrency-limited to 2)
- **alpha-feed-collect-scheduler** → `alpha-feed-collect-worker` (per ICP)
- **twitter-alpha-feed-collect-scheduler** → `twitter-alpha-feed-collect-worker` (per ICP)

## Summary

**~55 task definitions** total across LinkedIn, Twitter/X, calendar, knowledge, alpha feed, and internal systems.
