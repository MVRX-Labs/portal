# Design Decisions

Key architectural decisions and their rationale. Check here before making changes that affect project structure or technology choices.

## Trigger.dev for Background Jobs

**Decision:** All long-running work (AI generation, scraping, calendar sync) runs as Trigger.dev tasks, not in Next.js API routes.

**Why:** Vercel serverless functions have a 60s timeout. AI tasks can take minutes. Trigger.dev provides retries, observability, scheduling, and up to 1-hour max duration. Other options considered were Inngest and Temporal

---

## Drizzle ORM over Prisma

**Decision:** Use Drizzle ORM with raw SQL migrations.

**Why:** Lighter weight, closer to SQL, works well with Neon PostgreSQL serverless driver. Schema-as-code in `src/lib/schema.ts`. Better types & DX

---

## Apify for LinkedIn Scraping

**Decision:** Use Apify actors for LinkedIn profile data extraction.

**Why:** LinkedIn has no public API for profile data. Apify handles proxy rotation and anti-bot measures. Configured via `APIFY_API_TOKEN`.

---

## Calendar Sync: Polling, Not Webhooks

**Decision:** Calendar sync runs on a schedule (every 30 min) using Google's incremental `syncToken`, not push notifications.

**Why:** Google Calendar push notifications require channel management (expiry, renewal, public endpoint). 30-min latency is acceptable for meeting prep. See `docs/plans/completed/calendar-automation.md` for full architecture.

---

## Account/Contact Data Caveats

**Decision:** Never assume accounts or contacts are complete or accurate.

**Why:** Data comes from multiple sources (manual entry, calendar sync, engagement scraping, enrichment) with varying quality. Always handle missing fields gracefully. LinkedIn URLs may be stale. Company associations may be wrong.

---

## Decoupled Systems

**Decision:** Each subsystem (calendar sync, LinkedIn audit, engagement scraping) operates independently.

**Why:** Reduces blast radius. Calendar sync failing shouldn't block manual audits. Engagement scraping doesn't depend on calendar data. Each can be debugged and restarted independently.

---

## CUID2 with Prefixes for IDs

**Decision:** All entity IDs use CUID2 with type prefixes (e.g., `user_`, `acct_`, `run_`).

**Why:** Prefixes make IDs self-documenting in logs and debugging. CUID2 is sortable by creation time and collision-resistant. See `src/lib/ids.ts`.

---

## Anthropic Claude Agent SDK

**Decision:** Use `@anthropic-ai/claude-agent-sdk` for AI tasks, not raw API calls.

**Why:** Provides tool use, multi-turn conversations, and structured output. Tasks like LinkedIn audits and post generation use multi-turn agent loops with web search and document generation tools.

---

## Google Drive for Document Storage

**Decision:** Generated reports (audit DOCX, GTM DOCX, sentiment DOCX) are uploaded to Google Drive.

**Why:** Team already uses Google Workspace. Documents are accessible to non-technical stakeholders. Folder structure mirrors account hierarchy.

---

## Outbound Engagement Bot: Slack as the Review Interface

**Decision:** Outbound LinkedIn engagement (commenting, liking, reposting) is orchestrated via Slack interactive messages, not a portal UI.

**Why:** The workflow is: scrape recent posts from tracked LinkedIn profiles → post a Slack card for each → team member clicks an action button → `engagement-slack-action` task generates a comment (if needed) and marks the post. Slack is where the team already works; building a dedicated UI would add friction. Accounts opt in per-channel via `accounts.engagementSlackChannel`. The scraper (`outbound-engagement-scrape`) uses Apify and is rate-limited to 2 concurrent jobs via a Trigger.dev queue.

---

## LinkedIn Analytics: Managed Profiles vs Engagement Profiles

**Decision:** Client LinkedIn profiles tracked for analytics (`managedProfiles`) are a separate concept from external profiles tracked for outbound engagement (`engagementProfiles`).

**Why:** The workflows are orthogonal. Engagement profiles are targets we want to interact with; managed profiles are our clients' own profiles whose post performance we measure and report on. Keeping them in separate tables (`managed_profiles`, `managed_posts`, `managed_post_snapshots`, `analytics_reports`) prevents the engagement bot's state from bleeding into analytics and vice versa. The `weekly-analytics` task scrapes managed profiles every Monday and sends a performance summary to the account's `analyticsSlackChannel`.

---

## Idea Generator: Autonomous PR Bot

**Decision:** A scheduled Trigger.dev task (`idea-generator`) autonomously generates product ideas and opens PRs, running hourly during UK working hours.

**Why:** Keeps a steady stream of small improvements flowing without requiring manual effort. Uses a two-phase Claude approach: Phase 1 (ideation) reads the codebase and optionally web-searches; Phase 2 (implementation) writes the code. Randomised scope/strategy per run avoids repetition. Logs total cost per run.
