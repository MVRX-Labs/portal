# Sentiment Analyzer Implementation Plan

## Context

The MVRX portal has a non-functional stub for "Product Sentiment Analysis" — the API route uses `createToolHandler` which only creates a `"pending"` DB record and never dispatches to local-api. This plan implements a full multi-source automated sentiment analyzer using Apify actors (matching the LinkedIn Audit pattern), with .docx output to Google Drive.

**Selected direction:** Option C — Multi-source Apify scraping with all platforms (Reddit, G2/Capterra, Google Reviews, general web), source type selector UI, no manual text input, .docx to Google Drive.

---

## Implementation Steps

### Step 1: Update tool config fields
**File:** `src/lib/types.ts` (lines 138-165)

Replace the current sentiment-analysis config fields with:
- `productName` (text, required) — product to analyze
- `companyName` (text, required) — company name for search context
- `sources` (select, required) — "All Sources", "Reddit + Forums", "Review Sites (G2, Capterra)", "Google Reviews", "General Web"
- `urls` (textarea, optional) — additional specific URLs to include
- `keywords` (text, optional) — comma-separated keywords to track

### Step 2: Create sentiment scraper module
**New file:** `src/lib/sentiment-scraper.ts`

Modeled on `src/lib/linkedin-audit.ts` (reuses the same `runApifyActor` pattern). This module:
- Exports `scrapeSentimentSources()` function
- Takes productName, companyName, sourceType, additionalUrls, AbortSignal
- Runs appropriate Apify actors based on selected source type:
  - **Google Search** actor — discovers review/mention pages for the product
  - **Reddit Scraper** actor — scrapes Reddit threads mentioning the product
  - **Google Maps Reviews** actor — scrapes Google reviews
  - **Web Scraper** actor — scrapes user-provided URLs and discovered review pages
- Runs actors in parallel where possible (like LinkedIn audit does profile + posts)
- Returns `{ productName, sources: ScrapedSource[], discoveredUrls: string[] }`

Apify actors to research/select:
- Google Search Results Scraper (discover mentions)
- Reddit Scraper (Reddit discussions)
- Google Maps Reviews Scraper (Google reviews)
- Generic Web Scraper (G2, Capterra, and custom URLs)

### Step 3: Rewrite the API route
**File:** `src/app/api/tools/sentiment-analysis/route.ts`

Replace the generic `createToolHandler` with a custom handler following the LinkedIn Audit pattern (`src/app/api/tools/linkedin-audit/route.ts`):
1. Validate inputs (productName, companyName required)
2. Parse URLs from textarea (split by newline), parse source type
3. Create `"running"` DB record
4. Inside `withTimeoutGuard`:
   - Call `scrapeSentimentSources()` with appropriate parameters
   - Dispatch scraped data to `{NGROK_BASE_URL}/api/jobs/sentiment-analysis`
5. Error handling: update DB to failed, send Slack notification
6. Return `{ id, status: "running" }`

### Step 4: Add local-api job handler
**File:** `local-api/src/routes/jobs.ts`

Add new `POST /api/jobs/sentiment-analysis` route:
- Accepts: `runId, productName, companyName, scrapedSources, keywords, callbackUrl`
- Responds 202 immediately
- Calls `runClaudeJob()` with:
  - `model`: HAIKU_MODEL
  - `maxTurns`: 30
  - `prompt`: Instructs Claude to analyze all scraped sources and produce a comprehensive sentiment report as .docx, saved to `OUTPUT_DIR` as `"MVRX | {productName} | Sentiment Analysis.docx"`
  - `setupSession`: Writes scraped data as JSON files grouped by platform (e.g., `reddit-data.json`, `reviews-data.json`, `google-data.json`, `web-data.json`)

The .docx report should include:
- Executive summary with overall sentiment score (1-10) and distribution
- Platform-by-platform breakdown
- Theme analysis with sentiment per theme
- Top positive/negative quotes with source attribution
- Competitive context (competitor mentions)
- Actionable recommendations ranked by impact
- Appendix with all source URLs

### Step 5: No frontend changes needed
- `src/app/tools/sentiment-analysis/page.tsx` — already renders `ToolForm` dynamically
- `src/components/tool-form.tsx` — handles field rendering, submission, polling, and completion display
- `src/app/api/hooks/job-complete/route.ts` — callback handler works for all tools
- `src/app/api/runs/[id]/route.ts` — polling endpoint works for all tools

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/types.ts` | Modify | Update sentiment-analysis fields (lines 138-165) |
| `src/lib/sentiment-scraper.ts` | **Create** | Apify scraping orchestrator (modeled on `linkedin-audit.ts`) |
| `src/app/api/tools/sentiment-analysis/route.ts` | Rewrite | Custom handler with scraping + local-api dispatch |
| `local-api/src/routes/jobs.ts` | Modify | Add `/sentiment-analysis` route handler |

**Reused as-is (no changes):**
- `src/app/tools/sentiment-analysis/page.tsx`
- `src/components/tool-form.tsx`
- `src/lib/tool-handler.ts` (no longer used by this tool, but kept for others)
- `local-api/src/lib/claude-runner.ts`
- `src/app/api/hooks/job-complete/route.ts`
- `src/app/api/runs/[id]/route.ts`

**Reference files (patterns to follow):**
- `src/app/api/tools/linkedin-audit/route.ts` — custom route handler pattern
- `src/lib/linkedin-audit.ts` — Apify actor orchestration pattern

---

## Verification

1. Run `npm run typecheck` — no type errors
2. Start `npm run dev` and local-api server
3. Navigate to `/tools/sentiment-analysis`
4. Verify updated form fields render correctly (productName, companyName, sources selector, optional URLs, keywords)
5. Submit a test run with a known product
6. Verify Apify actors are called and return scraped data
7. Verify job dispatches to local-api successfully
8. Verify Claude processes and produces .docx output
9. Verify callback updates DB to "completed" with output
10. Verify .docx appears in Google Drive `Generated materials` folder
11. Verify the UI shows completion status
