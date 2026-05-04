# Twitter/X Parallel Offering

Build Twitter/X as a fully-fledged offering that mirrors all LinkedIn functionality.

## Current State

### LinkedIn Features (complete)

| Feature                                  | Trigger Task(s)                                                 | DB Tables                                                         | UI Page                                                 | API Routes                                                                        |
| ---------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Profile Registry**                     | —                                                               | `linkedin_profiles` (feature flags: analytics, outbound, inbound) | Account overview section                                | `GET/PATCH /accounts/[id]/linkedin-profiles`                                      |
| **Post Sync**                            | `linkedin-sync-scheduler` (every 2h), `linkedin-sync-profile`   | `linkedin_posts`, `linkedin_post_snapshots`, `linkedin_sync_runs` | —                                                       | `POST /accounts/[id]/engagement/scrape`, `POST /accounts/[id]/analytics/scrape`   |
| **Post Analytics**                       | `weekly-analytics-scheduler` (Monday 7am), `weekly-analytics`   | snapshots + sync runs                                             | `/analytics` page with KPI grid + per-profile breakdown | `GET/POST /accounts/[id]/analytics/*`                                             |
| **Post Categorisation**                  | `post-categoriser-scheduler` (daily 7:15am), `post-categoriser` | `linkedin_posts.category`                                         | Category badges in analytics                            | `PATCH /api/linkedin-posts/[postId]`                                              |
| **Outbound Engagement Bot**              | `engagement-slack-action`                                       | `linkedin_posts.engagementStatus` + Slack fields                  | `/linkedin-engagement`                                  | `GET/POST/PATCH/DELETE /accounts/[id]/engagement/*`, `POST /api/engagement-slack` |
| **Comment Scraping + Reply Suggestions** | Part of `linkedin-sync-profile`                                 | `linkedin_post_comments`                                          | Comment alerts in Slack                                 | —                                                                                 |
| **Inbound Lead Discovery**               | `linkedin-lead-upsert` (triggered by sync)                      | `leads`, `lead_csvs`, `linkedin_post_engagements`                 | `/leads`                                                | `GET/POST /accounts/[id]/leads/*`                                                 |
| **Profile Audit**                        | `linkedin-audit-generation`                                     | `tool_runs`                                                       | `/tools/linkedin-audit`                                 | `POST /api/tools/linkedin-audit`                                                  |
| **Post Generator**                       | `linkedin-post-generator`                                       | `tool_runs`                                                       | `/tools/linkedin-post-generator`                        | `POST /api/tools/linkedin-post-generator`                                         |
| **Post Humaniser**                       | `linkedin-humanizer` (not yet built)                            | —                                                                 | —                                                       | —                                                                                 |
| **LinkedIn-to-Twitter**                  | `linkedin-to-twitter`                                           | `tool_runs`                                                       | `/tools/linkedin-to-twitter`                            | `POST /api/tools/linkedin-to-twitter`                                             |
| **Alpha Feed**                           | alpha feed tasks                                                | `alpha_feed_*` tables                                             | `/alpha-feed`                                           | alpha feed API routes                                                             |
| **Post Tracker**                         | `track-post`                                                    | snapshots                                                         | Slack thread reports                                    | —                                                                                 |

### Twitter/X Features (current — substantially implemented)

| Feature                        | Status | Trigger Task(s)                                                   | DB Tables                                                               | UI Page               | API Routes                                                |
| ------------------------------ | ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| **Profile Registry**           | ✅     | —                                                                 | `twitter_profiles`                                                      | Account overview      | `GET/POST/PATCH /accounts/[id]/twitter-profiles`          |
| **Post Sync**                  | ✅     | `twitter-sync-scheduler`, `twitter-sync-profile`                  | `twitter_posts`, `twitter_post_snapshots`, `twitter_sync_runs`          | —                     | `POST /accounts/[id]/twitter-sync`                        |
| **Post Analytics**             | ✅     | `twitter-weekly-analytics-scheduler`, `twitter-weekly-analytics`  | snapshots + sync runs                                                   | `/twitter-analytics`  | `GET/POST /accounts/[id]/analytics/*`                     |
| **Post Categorisation**        | ✅     | `twitter-post-categoriser-scheduler`, `twitter-post-categoriser`  | `twitter_posts.category`                                                | Category badges       | —                                                         |
| **Outbound Engagement Bot**    | ✅     | `twitter-engagement-slack-action`                                 | `twitter_posts.engagementStatus` + Slack fields                         | `/twitter-engagement` | `GET/POST /accounts/[id]/twitter-engagement/*`            |
| **Reply Scraping**             | ✅     | Part of `twitter-sync-profile`                                    | `twitter_post_replies`                                                  | Slack alerts          | —                                                         |
| **Inbound Lead Discovery**     | ✅     | `twitter-lead-upsert`                                             | `leads`, `twitter_post_engagements`                                     | `/twitter-leads`      | `GET/POST /accounts/[id]/leads/*`                         |
| **Profile Audit**              | ✅     | `twitter-audit-generation`                                        | `tool_runs`                                                             | `/tools/twitter-audit`| `POST /api/tools/twitter-audit`                           |
| **Post Generator**             | ✅     | `twitter-post-generator`                                          | `tool_runs`                                                             | `/tools/twitter-post-generator` | `POST /api/tools/twitter-post-generator`        |
| **Twitter-to-LinkedIn**        | ✅     | `twitter-to-linkedin`                                             | `tool_runs`                                                             | `/tools/twitter-to-linkedin` | `POST /api/tools/twitter-to-linkedin`              |
| **Alpha Feed**                 | ✅     | `twitter-alpha-feed-collect-scheduler`, `twitter-alpha-feed-collect-worker` | `twitter_alpha_feeds`                                         | `/twitter-alpha-feed` | alpha feed API routes                                     |
| **Post Tracker**               | ✅     | `track-tweet`                                                     | snapshots                                                               | Slack thread reports  | —                                                         |
| **Post Humaniser**             | ❌     | `twitter-humanizer` (not yet built)                               | —                                                                       | —                     | —                                                         |

**Remaining gap:** Twitter Humaniser (`twitter-humanizer` task + API + UI) — the only Phase 1 item not yet implemented. LinkedIn Humaniser is also not yet implemented.

---

## Architecture Decisions

### 1. Twitter Data Source: Apify vs Twitter API v2

**Decision: Start with Apify, same as LinkedIn.**

Why:

- Twitter API v2 Basic tier is $100/mo for 10k reads — not enough for serious sync
- Pro tier is $5,000/mo — premature commitment before we validate the offering
- Apify has multiple Twitter scrapers with proxy rotation already handled
- Keeps the pattern identical to LinkedIn (Apify → normalise → DB)
- We already have caching, pagination, and retry infrastructure for Apify

Revisit when: volume demands it or we need write access (posting replies).

### 2. Unified vs Separate Profile Registry

**Decision: Create a new `twitter_profiles` table, NOT extend `linkedin_profiles`.**

Why:

- LinkedIn profiles are keyed on LinkedIn URL — different namespace entirely
- Feature flags (analytics, outbound, inbound) can be replicated
- Keeps blast radius contained per design-decisions.md principle
- Avoids schema migration complexity on the heavily-used linkedin_profiles table

### 3. Shared vs Separate Post Tables

**Decision: Separate `twitter_posts` table.**

Why:

- Fields differ (tweet ID vs apify post ID, retweets vs reposts, quote tweets, thread structure)
- Engagement metrics differ (likes, retweets, quote tweets, bookmarks, views/impressions)
- Keeps queries simple and fast

### 4. Shared Infrastructure

Reuse across both platforms:

- `src/lib/humanisation/` — AI-tell vocabulary, banned phrases
- `src/lib/apify/` — actor execution, caching, pagination
- `src/lib/slack.ts` — Slack notifications
- `src/lib/claude-agent.ts` — shared agent runner
- `src/lib/ids.ts` — prefixed CUID2 generation
- `tool_runs` table — tool execution tracking
- `leads` table — add `twitterUrl` field, leads can come from either platform

---

## Phase Plan

### Phase 0 — Schema & Infrastructure (1 week)

New database tables:

```
twitter_profiles
├── id (tprof_*)
├── accountId → accounts.id
├── twitterUrl (e.g. https://x.com/username)
├── twitterHandle (e.g. @username)
├── displayName
├── analyticsEnabled, outboundEnabled, inboundEnabled
├── engagementPersona
├── sourceType ("company" | "personal")
├── contactId → contacts.id
├── active, lastSyncedAt, createdAt, updatedAt

twitter_posts
├── id (tpost_*)
├── profileId → twitter_profiles.id
├── accountId → accounts.id
├── externalTweetId (from scraper)
├── content
├── tweetUrl
├── tweetType ("tweet" | "retweet" | "quote_tweet" | "reply")
├── likesCount, retweetsCount, quotesCount, repliesCount, bookmarksCount, viewsCount
├── postedAt, discoveredAt
├── engagementStatus, slackMessageTs, agentComment, engagedAt  (outbound workflow)
├── category
├── createdAt

twitter_post_snapshots
├── id (tsnap_*)
├── postId → twitter_posts.id
├── profileId, accountId
├── likesCount, retweetsCount, quotesCount, repliesCount, bookmarksCount, viewsCount
├── capturedAt

twitter_post_replies  (equivalent of linkedin_post_comments)
├── id (trepl_*)
├── postId → twitter_posts.id
├── profileId, accountId
├── tweetId (external)
├── authorName, authorHandle, authorBio, authorTwitterUrl
├── replyText, replyUrl, repliedAt
├── parentReplyId, isReply
├── repliedToByOwner
├── notifiedAt, createdAt

twitter_post_engagements  (likes, retweets, quotes)
├── id (teng_*)
├── postId → twitter_posts.id
├── profileId, accountId
├── authorName, authorHandle, authorTwitterUrl, authorBio, authorCompany, authorProfileImage
├── engagementType ("like" | "retweet" | "quote_tweet")
├── engagedAt
├── scrapeWindow ("early" | "late")
├── capturedAt

twitter_sync_runs
├── id (tsync_*)
├── profileId, accountId
├── status, postsFound, postsNew, errorMessage
├── apifyRunId, triggerRunId
├── createdAt, completedAt
```

Also:

- Add `twitterUrl` column to `leads` table
- Add `twitterEngagementSlackChannel` and `twitterAnalyticsSlackChannel` to `accounts` table
- Create `src/lib/twitter-profiles.ts` (normalise URL, extract handle, add/list/get)
- Create `src/lib/twitter-sync-db.ts` (engagement status helpers)
- Create Zod schemas in `src/lib/api-schemas/twitter-profiles.ts` and `src/lib/api-schemas/twitter-engagement.ts`
- Create `src/lib/ids.ts` prefixes: `tprof`, `tpost`, `tsnap`, `tsync`, `trepl`, `teng`

### Phase 1 — Content Tools (1-2 weeks)

Upgrade existing tools and add Twitter-native ones.

**1a. Twitter Post Generator** (`src/trigger/twitter-post-generator.ts`)

- Parallel to `linkedin-post-generator`
- Input: source material, poster info, voice context
- Output: 3 hook variations + 2 body versions (thread format + single tweet format)
- New prompts in `src/lib/twitter-post-prompts.ts` (not repurposed LinkedIn prompts — Twitter has its own voice/constraints)
- API: `POST /api/tools/twitter-post-generator`
- UI: `/tools/twitter-post-generator`

**1b. Twitter Humaniser** (`src/trigger/twitter-humanizer.ts`)

- Parallel to `linkedin-humanizer`
- Shorter format constraints (280 chars), thread-aware
- API: `POST /api/tools/twitter-humanizer`
- UI: `/tools/twitter-humanizer`

**1c. Upgrade LinkedIn-to-Twitter tool**

- Keep as-is but add reverse: `POST /api/tools/twitter-to-linkedin`
- New task `twitter-to-linkedin` with its own prompts

### Phase 2 — Sync & Analytics (2-3 weeks)

**2a. Twitter Sync** (`src/trigger/twitter-sync.ts`)

- Parallel to `linkedin-sync.ts`
- Scheduled: every 4h (less aggressive than LinkedIn's 2h — Twitter rate limits are stricter)
- Tasks: `twitter-sync-scheduler`, `twitter-sync-profile`
- Uses Apify Twitter scraper actors
- Pipeline: scrape tweets → normalise → upsert posts + snapshots → scrape replies (≤3 days old) → scrape engagers (early/late windows)
- Triggers `twitter-lead-upsert` if `inboundEnabled`
- Sends Slack cards if `outboundEnabled`
- Sends unreplied reply alerts if `analyticsEnabled`

**2b. Twitter Profile Management API**

- `GET/POST /api/accounts/[id]/twitter-profiles`
- `PATCH /api/accounts/[id]/twitter-profiles/[profileId]`

**2c. Twitter Analytics** (`src/trigger/twitter-analytics.ts`)

- Parallel to `analytics-scrape.ts`
- Weekly report scheduler (Monday 7am)
- Metrics: likes, retweets, quotes, replies, bookmarks, views (richer than LinkedIn)
- Sends to `twitterAnalyticsSlackChannel`

**2d. Twitter Post Categoriser** (`src/trigger/twitter-post-categoriser.ts`)

- Parallel to `post-categoriser.ts`
- Same categories work (thought_leadership, domain_knowledge, etc.)
- Daily scheduler

**2e. Twitter Analytics Page**

- New page `/twitter-analytics` or unified tab on `/analytics`
- KPI grid with Twitter-specific metrics (add views/bookmarks)
- Per-profile post breakdown

### Phase 3 — Outbound Engagement Bot (2 weeks)

**3a. Twitter Engagement Bot** (`src/trigger/twitter-engagement-slack-action.ts`)

- Parallel to `engagement-slack-action.ts`
- Slack cards for new tweets from tracked profiles
- Action buttons: Reply, Like, Retweet, Quote Tweet, Skip
- AI reply generation via Claude (shorter, punchier than LinkedIn comments)
- New reply prompts in `src/lib/twitter-reply-prompts.ts`

**3b. Twitter Reply Suggestions** (`src/lib/twitter-reply-suggestions.ts`)

- Parallel to `comment-reply-suggestions.ts`
- Three formulas adapted for Twitter's shorter format
- 280-char hard limit on suggestions

**3c. Engagement Bot UI**

- New page `/twitter-engagement`
- Profile management (add handles, personas, CSV upload)
- Slack channel config for `twitterEngagementSlackChannel`
- Job history, recent tweets with status badges

**3d. Engagement Slack Handler**

- Extend `POST /api/engagement-slack` to handle Twitter actions (action IDs: `tw_engage_reply:`, `tw_engage_like:`, etc.)
- OR separate endpoint `POST /api/twitter-engagement-slack`

### Phase 4 — Inbound Lead Discovery (1-2 weeks)

**4a. Twitter Lead Upsert** (`src/trigger/twitter-lead-upsert.ts`)

- Parallel to `linkedin-lead-upsert.ts`
- Extract leads from tweet likes, retweets, quote tweets, and replies
- Upsert into shared `leads` table (populate `twitterUrl` alongside or instead of `linkedinUrl`)
- Merge leads that appear on both platforms (match by name + company heuristic)
- CSV generation + Slack notification

**4b. Leads Page Update**

- Add Twitter engagement types to existing `/leads` page
- Show which platform lead was discovered on
- Export CSV includes `twitterProfileUrl` column

### Phase 5 — Twitter Profile Audit (1-2 weeks)

**5a. Twitter Audit Task** (`src/trigger/twitter-audit.ts`)

- Parallel to `linkedin-audit.ts`
- Scrape profile + recent tweets via Apify
- Claude Agent analyses: bio, pinned tweet, content strategy, engagement rates, benchmark accounts
- DOCX output → Google Drive
- Scorecard categories adapted for Twitter (thread strategy, reply engagement, hashtag usage, etc.)

**5b. Audit UI**

- `/tools/twitter-audit` page
- Same ToolForm pattern

### Phase 6 — Twitter Alpha Feed (1-2 weeks)

**6a. Twitter Feed Collection**

- Parallel to LinkedIn alpha feed
- Track "sages" (thought leader Twitter handles) and keywords/hashtags
- Scrape via Apify Twitter search actors
- Two-column layout: Sage tweets | Keyword/hashtag tweets

**6b. Alpha Feed UI Extension**

- Add Twitter tab to `/alpha-feed` or new `/twitter-alpha-feed`
- TwitterPostCard component (handle, avatar, tweet text, engagement metrics, retweet/quote indicators)

### Phase 7 — Post Tracker (1 week)

**7a. Twitter Post Tracker** (`src/trigger/twitter-post-tracker.ts`)

- Parallel to `post-tracker.ts`
- Track specific tweet URLs manually
- Scrape stats, upsert, report to Slack thread
- Richer metrics: likes, retweets, quotes, replies, bookmarks, views

---

## Migration Strategy

### Database Migration Order

1. Phase 0: All new tables + `leads.twitterUrl` + account Slack channel columns
2. Create all migrations at once, apply incrementally

### Navigation Updates

Add to sidebar under Account section:

```
Twitter Post Generator (🐦)        — Phase 1
Twitter Humaniser (🐦)             — Phase 1
Twitter-to-LinkedIn (🔄)           — Phase 1
Twitter Engagement Bot (🐦)        — Phase 3
Twitter Post Analytics (📈)        — Phase 2
Twitter Alpha Feed (🔥)            — Phase 6
Twitter Audit (👤)                 — Phase 5
```

### Account Overview Updates

Add `TwitterProfilesSection` parallel to `LinkedinProfilesSection`:

- Same three feature toggles (Inbound, Analytics, Outbound)
- Shows Twitter handle instead of LinkedIn URL

### Shared Components to Create

- `TwitterPostCard` (similar to `LinkedInPostCard` but with Twitter metrics)
- `TwitterProfileForm` (handle input instead of LinkedIn URL)

---

## Apify Actors Needed

Research and select actors for:
| Purpose | LinkedIn Actor | Twitter Actor (TBD) |
|---|---|---|
| Profile scraping | `VhxlqQXRwhW8H5hNV` | Twitter profile scraper |
| Post scraping | `Wpp1BZ6yGWjySadk3`, `supreme_coder/linkedin-post` | Twitter user tweets scraper |
| Post search | `apimaestro~linkedin-posts-search-scraper` | Twitter search scraper |
| Reactions/Likes | `apimaestro~linkedin-post-reactions` | Tweet likes scraper |
| Comments/Replies | `apimaestro~linkedin-post-comments-replies...` | Tweet replies scraper |
| Reshares/Retweets | `apimaestro~linkedin-post-reshares` | Retweets scraper |

Action item: audit Apify marketplace for best Twitter actors before starting Phase 0.

---

## Risk & Open Questions

1. **Twitter API write access**: If we ever want to post replies/tweets programmatically (not just generate them), we need Twitter API OAuth. Apify is read-only. This is a future concern, not blocking.

2. **Rate limits**: Twitter is more aggressive about rate limiting than LinkedIn/Apify. Sync frequency may need to be lower (every 4-6h vs LinkedIn's 2h).

3. **Account-level Twitter handle**: Should accounts have a single "primary" Twitter handle like they have a LinkedIn URL? Probably yes — add to account overview.

4. **Cross-platform lead matching**: When the same person appears as a LinkedIn engager AND Twitter engager, we should merge them. Matching by name + company is fuzzy. Phase 4 should handle this carefully.

5. **Thread vs single tweet**: LinkedIn posts are always single posts. Twitter has threads, quote tweets, and replies as first-class content types. The sync and analytics need to handle thread grouping.

6. **Impressions/Views**: Twitter provides view counts; LinkedIn doesn't (publicly). This is a differentiator for Twitter analytics — lean into it.

---

## Suggested Build Order

**Start here → Phase 0 + Phase 1** (schema + content tools). This validates the offering with minimal infrastructure. Content tools are the quickest way to deliver value and test demand.

Then: **Phase 2** (sync + analytics) gives us the monitoring backbone.

Then: **Phase 3** (engagement bot) is the highest-value feature for the team's daily workflow.

Phases 4-7 can be prioritised based on client demand.
