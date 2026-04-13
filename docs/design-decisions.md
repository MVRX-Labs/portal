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

**Why:** The workflow is: scrape recent posts from tracked LinkedIn profiles → post a Slack card for each → team member clicks an action button → `engagement-slack-action` task generates a comment (if needed) and marks the post. Slack is where the team already works; building a dedicated UI would add friction. Accounts opt in per-channel via `accounts.engagementSlackChannel`. Post scraping is handled by the unified `linkedin-sync-profile` task (see "Unified LinkedIn Profile Registry" below).

---

## Unified LinkedIn Profile Registry

**Decision:** All tracked LinkedIn profiles (analytics, outbound engagement, inbound lead discovery) live in a single `linkedin_profiles` table with feature flags (`analytics_enabled`, `outbound_enabled`, `inbound_enabled`).

**Why:** The three systems (analytics, outbound engagement, inbound lead discovery) all start the same way — scraping recent posts via Apify. Unifying them into one profile registry and one scraping job (`linkedin-sync-profile`, every 2 hours) eliminates duplicate Apify calls, simplifies profile management, and makes it easy for a single profile to serve multiple purposes. Posts live in `linkedin_posts` with engagement workflow fields for outbound and scrape-window timestamps for lead discovery. See `docs/plans/completed/linkedin-sync-unification.md`.

---

## Idea Generator: Autonomous PR Bot

**Decision:** A scheduled Trigger.dev task (`idea-generator`) autonomously generates product ideas and opens PRs, running once daily (9 AM UK) on weekdays.

**Why:** Keeps a steady stream of small improvements flowing without requiring manual effort. Uses a two-phase Claude approach: Phase 1 (ideation) reads the codebase and optionally web-searches; Phase 2 (implementation) writes the code. Randomised scope/strategy per run avoids repetition. Logs total cost per run.

---

## Knowledge Hub: Three-Layer Event Architecture

**Decision:** Knowledge ingestion uses a three-layer design: raw events → LLM-extracted knowledge units → per-account living state documents.

**Why:** Slack messages are noisy and context-dependent; a single message rarely means anything in isolation. Normalising raw events into typed, atomic knowledge units (action items, decisions, context updates, etc.) separates ingestion from extraction and makes it easy to re-process or re-synthesise without re-fetching. Living state documents (brief, open items, activity log) give AI tools a compact, always-fresh view of each account rather than forcing them to process hundreds of raw messages. Internal channel content is tagged at the event level and never surfaces in client-facing outputs. See `docs/plans/completed/knowledge-hub.md` for full architecture.

---

## Twitter/X as a Parallel Offering

**Decision:** Twitter/X mirrors the full LinkedIn feature set using separate database tables (`twitter_profiles`, `twitter_posts`, etc.) rather than extending the LinkedIn tables.

**Why:** LinkedIn and Twitter use different namespaces (URL vs. handle), different engagement metrics (reposts vs. retweets/quote tweets), and different content structures (single posts vs. threads). Separate tables keep queries simple, avoid schema migrations on heavily-used LinkedIn tables, and contain blast radius per the decoupled systems principle. Feature flags (`analytics_enabled`, `outbound_enabled`, `inbound_enabled`) are replicated identically. Both platforms share `tool_runs`, `leads`, `apify_cache`, `icp_definitions`, and all the `lib/` utilities. See `docs/plans/completed/twitter-parallel.md` for full architecture.

---

## Skill Ingestion: Shared `runClaudeAgent()` Helper

**Decision:** All tasks that run a Claude Agent loop use a shared `runClaudeAgent()` helper from `src/lib/claude-agent.ts`, not inline implementations.

**Why:** The agent loop pattern (prompt → tool calls → output + cost tracking) was duplicated across `idea-generator.ts` and `implement-suggestion.ts`. Extracting it to a shared module ensures consistent timeout handling, cost logging, and error propagation. New skill tasks generated by `ingest-skill` also import from the same helper, so improvements benefit all tasks automatically.
