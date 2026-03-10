# Growth Report Population Job — Plan

## Overview

A Trigger.dev task that takes an account (with website, LinkedIn URLs, contacts) and produces a fully populated `GrowthReportContent` docx, uploaded to Google Drive.

## Inputs (from DB)

- `account.website` — target website URL
- `account.linkedinUrl` — company LinkedIn page
- `account.name` — company name
- `account.industry` — used for research context
- `contacts[].linkedinUrl` — founder/CEO LinkedIn profiles
- `contacts[].name` — contact names

No other user input required. Everything else is discovered automatically.

---

## Execution Flow (3 Phases)

```
Phase 1: Research & Discovery (Claude Agent)
  Claude uses WebSearch + WebFetch to discover:
  ├── Top 5-6 competitors (websites)
  ├── Category search queries for SERP testing
  ├── Social media handles (IG, TikTok, etc.)
  └── Trustpilot URL
              │
              ▼
Phase 2: Parallel Data Collection (Apify scrapers)
  ├── SimilarWeb (target + discovered competitors)
  ├── Ahrefs (target + discovered competitors)
  ├── SEO Audit (target, 15-20 pages)
  ├── LinkedIn profiles + posts (per person)
  ├── Instagram profile
  ├── TikTok profile
  ├── robots.txt + llms.txt (direct HTTP fetch)
  ├── Google SERP (discovered category queries)
  ├── Trustpilot (discovered URL)
  ├── Crunchbase
  ├── Tracxn
  └── Reddit (brand name search)
              │
              ▼
Phase 3: Analysis & Generation (Claude Agent)
  All raw data → Claude → GrowthReportContent JSON
              │
              ▼
Phase 4: Build & Deliver
  ├── buildGrowthReportDocx() → Buffer
  ├── Upload to Google Drive
  └── Slack notification
```

---

## Phase 1: Research & Discovery

**Method:** Claude Agent SDK `query()` with `WebSearch` + `WebFetch` tools

**Model:** Sonnet (fast, good enough for research)

**Prompt asks Claude to discover:**

1. **Competitors (5-6 sites)**
   - Search for "{company} competitors", "{industry} UK companies", etc.
   - Visit SimilarWeb's "similar sites" page for the target
   - Identify companies in same market, similar size/positioning
   - Return: list of competitor domain names

2. **Category search queries (3-5)**
   - Based on the company's products/services and industry
   - Queries a potential customer would search (e.g. "best wellness store UK")
   - Mix of commercial + informational intent
   - Return: list of Google search queries

3. **Social media handles**
   - Fetch the target homepage, extract social links from footer/header
   - Look for instagram.com/_, tiktok.com/@_, twitter.com/_, pinterest.com/_
   - If not found on site, search the web for "{company} instagram", etc.
   - Return: handles/URLs for each platform found

4. **Trustpilot URL**
   - Search for "{company name} trustpilot" or fetch trustpilot.com/review/{domain}
   - Return: Trustpilot business URL, or null if not found

**Output:** JSON with competitors, queries, social handles, trustpilot URL

**Allowed tools:** `["WebSearch", "WebFetch"]`
**Max turns:** 20
**Estimated time:** 30-60s
**Estimated cost:** ~$0.10-0.30 (Sonnet)

---

## Phase 2: Data Collection

All scrapers run in parallel via `Promise.allSettled`. Failures are non-fatal — we proceed with available data and note gaps.

### Scraper 1: SimilarWeb

**Sections fed:** Traffic & Audience, Competitive Benchmarking, Cover KPIs

**Actor:** `curious_coder/similarweb-scraper`

**Input:** Target website + 5-6 competitor URLs (from Phase 1)

**Data per site:** Monthly visits, global/country rank, category rank, bounce rate, pages/visit, visit duration, traffic source breakdown (search/direct/referral/social), geographic split

**Notes:** Single run for all sites. Feeds both client sections AND competitive table.

### Scraper 2: Ahrefs Domain Overview

**Sections fed:** Domain Authority, Competitive Benchmarking, Cover KPIs

**Actor:** `scrap3r/ahrefs-domain-overview-checker`

**Input:** Target website + competitor URLs

**Data per site:** DR, total backlinks, referring domains, dofollow backlinks, dofollow referring domains

### Scraper 3: SEO Audit

**Sections fed:** On-Site SEO Audit, Content & Blog Audit, Cover KPIs

**Actor:** `smart-digital/complete-seo-audit-tool` (`UFSUQD7pWNwN3jExC`)

**Input:** Target website, crawl 15-20 pages

**Data:** Per-page scores (0-100), meta tags, headings, content (word count), technical SEO, schema, image SEO, links, broken URLs, overall + category scores. Blog pages in the crawl feed the Content Audit section.

### Scraper 4: LinkedIn (per person)

**Sections fed:** LinkedIn Audit, LinkedIn Strategy, Cover KPIs, Social SEO

**Actors (existing):**

- `VhxlqQXRwhW8H5hNV` — profile data
- `Wpp1BZ6yGWjySadk3` — posts (20 per person)

**Input:** Company LinkedIn URL + each contact's LinkedIn URL

**Runs:** Parallelised per person (profile + posts together). ~2-4 people.

**Data:** Follower counts, headlines, post text/likes/comments/reposts/dates. Theme classification done by Claude in Phase 3.

### Scraper 5: Instagram Profile

**Sections fed:** Social SEO, Cover KPIs

**Actor:** `apify/instagram-profile-scraper`

**Input:** IG handle (from Phase 1 discovery)

**Data:** Follower count, post count, bio

**Skipped if:** No IG handle discovered

### Scraper 6: TikTok Profile

**Sections fed:** Social SEO, Cover KPIs

**Actor:** `clockworks/tiktok-profile-scraper`

**Input:** TikTok handle (from Phase 1 discovery)

**Data:** Follower count, heart count, video count

**Skipped if:** No TikTok handle discovered

### Scraper 7: robots.txt + llms.txt (direct HTTP)

**Sections fed:** AI Visibility

**Method:** Plain `fetch()` — no Apify actor needed

**Fetches:**

- `{website}/robots.txt` — parse for AI bot directives (GPTBot, ClaudeBot, OAI-SearchBot, PerplexityBot, anthropic-ai, CCBot, Google-Extended)
- `{website}/llms.txt` — check 200 vs 404

**Data:** Per-bot allow/block status, llms.txt presence

### Scraper 8: Google SERP

**Sections fed:** AI Visibility (Share of Model)

**Actor:** `nFJndFXA5zjCTuudP` (existing Google Search Results Scraper)

**Input:** Category queries from Phase 1 (3-5 queries)

**Data:** Top 10 organic results per query. We check if target site appears and who ranks instead.

**Also includes:** `"{company name}" google business profile` query to check entity presence.

### Scraper 9: Trustpilot

**Sections fed:** Entity SEO

**Actor:** `casper11515/trustpilot-reviews-scraper`

**Input:** Trustpilot URL from Phase 1 (or search by company name)

**Data:** Review count, average star rating, trust score

**Skipped if:** No Trustpilot presence found

### Scraper 10: Crunchbase

**Sections fed:** Entity SEO

**Actor:** `curious_coder/crunchbase-scraper`

**Input:** Company name search

**Data:** Founded year, employee count, funding amount, industry

### Scraper 11: Tracxn

**Sections fed:** Entity SEO

**Actor:** `fresh_cliff/tracxn-scraper-api`

**Input:** Company name search

**Data:** Founded year, employee count, funding (for cross-reference with Crunchbase)

### Scraper 12: Reddit

**Sections fed:** Reddit Presence Audit

**Actor:** `oKbfaRlpOJ4bubyBN` (existing Reddit Scraper Lite)

**Input:** Brand name, maxItems: 50

**Data:** Posts mentioning brand, with subreddit, score, comments, text. Sentiment classification in Phase 3.

---

## Phase 3: Claude Analysis

**Method:** Claude Agent SDK `query()`, reads all scraped data from session directory

**Model:** Opus (quality matters most here — this is the report content)

**Allowed tools:** `["Read", "Glob"]`

**Input files written to session dir:**

- `similarweb.json` — traffic data for all sites
- `ahrefs.json` — domain authority for all sites
- `seo-audit.json` — on-site audit results
- `linkedin-company.json` — company page data
- `linkedin-{slug}.json` — per-person profile + posts
- `instagram.json`, `tiktok.json` — social profiles
- `ai-visibility.json` — robots.txt/llms.txt + SERP results
- `trustpilot.json`, `crunchbase.json`, `tracxn.json` — entity data
- `reddit.json` — brand mentions
- `research.json` — Phase 1 outputs (competitors, queries, social handles)

**Prompt instructs Claude to:**

1. Read all data files
2. Produce a single JSON matching `GrowthReportContent` schema
3. Guidelines:
   - Base all findings on actual scraped data with specific numbers
   - Identify patterns and cross-section insights
   - Classify LinkedIn posts by theme, score them
   - Create LinkedIn content strategy per person based on their profile + existing posts
   - Stack-rank strategy initiatives by impact-to-effort
   - Generate realistic 12-month measurement targets based on current baselines
   - Classify Reddit mentions by sentiment and type
   - SOW workstreams should reflect the specific gaps found
   - Pricing uses standard MVRX tiers but the option descriptions should reference the actual findings

**SOW & Pricing approach:**

- Standard MVRX price components are hardcoded (£1,500 for Tech SEO, £2,500 for LinkedIn, etc.)
- Claude decides which components go into which option based on report findings
- Option A = full execution of all identified initiatives
- Option B = strategy + content only (no technical execution)
- Option C = advisory + audits only
- If LinkedIn is a major finding → add Option D (LinkedIn-only)
- Option descriptions reference actual findings from the report

**Case studies:** Hardcoded in the prompt (ElevenLabs, Recraft, ElevenLabs Paid). Not generated by Claude.

**Max turns:** 15 (just reading files and outputting JSON)
**Estimated cost:** ~$2-5 (Opus, large context)

---

## Scraper Summary Table

| #   | Actor                                     | Existing?      | Sections Fed                   |
| --- | ----------------------------------------- | -------------- | ------------------------------ |
| —   | Claude Agent (Sonnet)                     | Pattern exists | Discovery for all              |
| 1   | `curious_coder/similarweb-scraper`        | **New**        | Traffic, Competitive, KPIs     |
| 2   | `scrap3r/ahrefs-domain-overview-checker`  | **New**        | Domain Auth, Competitive, KPIs |
| 3   | `smart-digital/complete-seo-audit-tool`   | **New**        | Site Audit, Content, KPIs      |
| 4   | `VhxlqQXRwhW8H5hNV` + `Wpp1BZ6yGWjySadk3` | Yes            | LinkedIn Audit, Strategy, KPIs |
| 5   | `apify/instagram-profile-scraper`         | **New**        | Social SEO, KPIs               |
| 6   | `clockworks/tiktok-profile-scraper`       | **New**        | Social SEO, KPIs               |
| 7   | Direct HTTP fetch                         | N/A            | AI Visibility                  |
| 8   | `nFJndFXA5zjCTuudP`                       | Yes            | AI Visibility (SERP)           |
| 9   | `casper11515/trustpilot-reviews-scraper`  | **New**        | Entity SEO                     |
| 10  | `curious_coder/crunchbase-scraper`        | **New**        | Entity SEO                     |
| 11  | `fresh_cliff/tracxn-scraper-api`          | **New**        | Entity SEO                     |
| 12  | `oKbfaRlpOJ4bubyBN`                       | Yes            | Reddit Audit                   |

**Existing actors reused:** 4 (LinkedIn profile, LinkedIn posts, Google SERP, Reddit)
**New actors:** 7
**No-actor steps:** 2 (robots.txt/llms.txt fetch, Claude discovery)

---

## Estimated Total Cost Per Report

| Step                               | Cost      |
| ---------------------------------- | --------- |
| Phase 1: Claude Discovery (Sonnet) | ~$0.20    |
| SimilarWeb (6-7 sites)             | ~$0.50    |
| Ahrefs (6-7 sites)                 | ~$0.50    |
| SEO Audit (15-20 pages)            | ~$1.00    |
| LinkedIn (3-4 people)              | ~$0.50    |
| Instagram + TikTok                 | ~$0.10    |
| Google SERP (5 queries)            | ~$0.02    |
| Trustpilot                         | ~$0.10    |
| Crunchbase + Tracxn                | ~$0.50    |
| Reddit                             | ~$0.10    |
| Phase 3: Claude Analysis (Opus)    | ~$3.00    |
| **Total**                          | **~$6-7** |

---

## Estimated Runtime

| Step                         | Time                            |
| ---------------------------- | ------------------------------- |
| Phase 1: Discovery           | 30-60s                          |
| Phase 2: Scraping (parallel) | 60-180s (bottleneck: SEO audit) |
| Phase 3: Analysis            | 60-120s                         |
| Phase 4: Build + Upload      | 5-10s                           |
| **Total**                    | **~3-6 minutes**                |

---

## File Structure

```
src/trigger/growth-report.ts              — Main orchestrator task
src/lib/growth-report/
├── schema.ts                             — (done) TypeScript interfaces
├── styles.ts                             — (done) Docx styling helpers
├── builder.ts                            — (done) Docx assembly
├── sections/                             — (done) Section builders
├── discovery.ts                          — Phase 1: Claude research agent
├── scrapers.ts                           — Phase 2: All Apify calls + direct fetches
├── analysis-prompt.ts                    — Phase 3: Claude analysis prompt
└── constants.ts                          — MVRX case studies, pricing components
src/app/api/tools/growth-report/
└── route.ts                              — API endpoint
```

---

## Implementation Order

1. `discovery.ts` — Claude research agent (competitors, queries, handles)
2. `scrapers.ts` — All Apify scraper functions
3. `analysis-prompt.ts` — The big Claude analysis prompt
4. `constants.ts` — Hardcoded case studies, pricing tiers
5. `src/trigger/growth-report.ts` — Orchestrator wiring it all together
6. `route.ts` — API endpoint
7. Test with a real account end-to-end
