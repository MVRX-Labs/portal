# Plan: GEO Audit Trigger.dev Task

**Status: IMPLEMENTED (v1)**

## Goal

Create a Trigger.dev task that performs a Generative Engine Optimization (GEO) audit on a given URL, producing a scored report analyzing how well a site is optimized for AI-powered search engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews).

Based on the open-source skill at [github.com/zubair-trabzada/geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude).

## Architecture Decision

**Approach: Inline the audit methodology as a Claude Agent SDK prompt, bundle Python helper scripts.**

Why not install the full skill system:

- The skill relies on Claude Code's `~/.claude/skills/` and `agents/` filesystem conventions — fragile in a container
- `settingSources` loading is untested in Trigger.dev's runtime
- The subagent parallelism is a Claude Code CLI feature, not available via the SDK's `query()`

Instead:

- Extract the audit methodology from the SKILL.md files into a comprehensive prompt
- Bundle the 4 key Python scripts (`fetch_page.py`, `citability_scorer.py`, `brand_scanner.py`, `llmstxt_generator.py`) as files copied to the session directory at runtime
- Use `runClaudeAgent()` with `Bash`, `Read`, `Write`, `WebSearch`, `WebFetch` tools
- The agent calls the Python scripts via Bash and synthesizes findings into a report

This matches the existing `account-enrichment` and `linkedin-audit` patterns.

## Scoring Model

From the original skill:

```
GEO_Score = (Citability × 0.25) + (Brand Authority × 0.20) + (Content/E-E-A-T × 0.20)
          + (Technical × 0.15) + (Schema × 0.10) + (Platform Optimization × 0.10)
```

## Implementation Steps

### Step 1: Bundle Python Scripts

Create `src/trigger/geo-audit/` directory with:

- `scripts/fetch_page.py` — page fetching, HTML parsing, robots.txt/llms.txt checking, sitemap crawling
- `scripts/citability_scorer.py` — AI citation readiness scoring
- `scripts/brand_scanner.py` — brand presence across YouTube, Reddit, Wikipedia, etc.
- `scripts/llmstxt_generator.py` — llms.txt validation/generation

Copy these from the upstream repo. They only need `beautifulsoup4`, `requests`, `lxml` (the lightweight deps — skip `reportlab`, `playwright`, `flask`).

**Build config change:** Add `beautifulsoup4`, `requests`, `lxml` as Python deps available in the container. Since Trigger.dev runs Node, we need Python available — check if the base image includes it or if we need a build extension. If Python isn't available, we can port the critical logic (fetch + parse) to Node using `cheerio` instead.

### Step 2: Create the Trigger Task

**File:** `src/trigger/geo-audit.ts`

```ts
interface GeoAuditPayload {
  url: string;
  accountId?: string; // optional: link results to an account
  requestedBy?: string; // for Slack notifications
  model?: "haiku" | "sonnet" | "opus"; // default: sonnet
}

interface GeoAuditResult {
  url: string;
  geoScore: number;
  scores: {
    citability: number;
    brandAuthority: number;
    contentEeat: number;
    technical: number;
    schema: number;
    platformOptimization: number;
  };
  reportMarkdown: string;
  costUsd: number;
  durationMs: number;
}
```

Task structure:

1. Create temp session directory
2. Copy Python scripts to session dir (or use them from a known path)
3. Install Python deps (`pip install beautifulsoup4 requests lxml` — cached after first run)
4. Run `runClaudeAgent()` with the GEO audit prompt and full tool access
5. Read the generated `GEO-AUDIT-REPORT.md` from session dir
6. Parse the scores from the report (or have Claude return structured JSON)
7. Optionally save to DB / upload to Google Drive
8. Clean up session dir
9. Return structured result

### Step 3: The Audit Prompt

The prompt should include the full audit methodology extracted from the SKILL.md files:

```
You are performing a GEO (Generative Engine Optimization) audit on {url}.

## Phase 1: Discovery
1. Use the fetch_page.py script to crawl the homepage and extract metadata
2. Determine business type (SaaS / Local / E-commerce / Publisher / Agency)
3. Crawl sitemap to discover key pages (max 20 pages)

## Phase 2: Analysis (6 dimensions)

### 1. AI Citability (weight: 25%)
- Run citability_scorer.py on key pages
- Assess: clear definitions, data-backed claims, structured answers, quotable passages
- Score 0-100

### 2. Brand Authority (weight: 20%)
- Run brand_scanner.py to check presence on YouTube, Reddit, Wikipedia, LinkedIn, etc.
- Assess: branded search results, knowledge panel presence, authoritative backlinks
- Score 0-100

### 3. Content & E-E-A-T (weight: 20%)
- Assess: expertise signals, author bios, original research, content depth
- Check for thin content, duplicate content, content freshness
- Score 0-100

### 4. Technical SEO for AI (weight: 15%)
- Check robots.txt for AI crawler access (GPTBot, ClaudeBot, PerplexityBot, etc.)
- Check for llms.txt using fetch_page.py
- Assess: page speed signals, mobile-friendliness, crawlability
- Score 0-100

### 5. Schema/Structured Data (weight: 10%)
- Check existing JSON-LD, microdata, RDFa
- Assess completeness and correctness
- Identify missing schema opportunities
- Score 0-100

### 6. Platform Optimization (weight: 10%)
- Assess optimization for Google AI Overviews, ChatGPT, Perplexity, Gemini
- Check featured snippet readiness, FAQ structure, concise answers
- Score 0-100

## Phase 3: Report
Write a GEO-AUDIT-REPORT.md with:
- Executive summary with composite GEO Score
- Score breakdown table
- Issues by severity (Critical / High / Medium / Low)
- Quick wins (top 5 things to fix immediately)
- 30-day action plan

Also write a GEO-AUDIT-SCORES.json with the structured scores.
```

### Step 4: API Route (optional)

**File:** `src/app/api/geo-audit/route.ts`

Simple POST endpoint to trigger the task:

```ts
POST /api/geo-audit
Body: { url: string, accountId?: string }
Response: { runId: string }
```

Uses Zod schema in `src/lib/api-schemas/geo-audit.ts`.

### Step 5: Slack Integration

On completion, send a Slack message with:

- URL audited
- Composite GEO Score (with color coding: red < 40, yellow 40-70, green > 70)
- Top 3 findings
- Link to full report (if uploaded to Google Drive)

On failure, use standard `sendSlackNotification()` pattern.

## Open Questions

1. **Python availability in Trigger.dev container?** The current build uses Node runtime. We may need to:
   - Add a build extension for Python
   - OR port the Python scripts to Node/TypeScript (using `cheerio` for HTML parsing, `node-fetch` for HTTP)
   - Porting is more work upfront but eliminates the Python dependency entirely

2. **Model choice for cost vs quality?**
   - Sonnet is the sweet spot (fast + capable enough for analysis)
   - Haiku would be cheaper but may produce lower quality analysis
   - Opus for premium audits
   - Default to Sonnet, allow override via payload

3. **Where to store reports?**
   - Google Drive (like linkedin-audit) — consistent with existing pattern
   - Database (as text/JSON) — simpler, queryable
   - Both? Store scores in DB, full report on Drive

4. **Max turns for the agent?**
   - The full audit with 20 pages + Python scripts + analysis will need many turns
   - Estimate: 40-60 turns for a thorough audit
   - Set `maxTurns: 80` with `maxDuration: 1800` (30 min)

## Dependencies

- `@anthropic-ai/claude-agent-sdk` — already installed
- `beautifulsoup4`, `requests`, `lxml` — Python deps (if keeping Python scripts)
- OR `cheerio`, `axios` — Node alternatives (if porting)

## Risks

- **Cost per audit:** A full Sonnet audit with 40+ turns could cost $2-5 per run. Need to be mindful of accidental loops.
- **Rate limiting:** Target sites may rate-limit our crawling. The Python scripts have 1s delays built in.
- **Accuracy:** The scoring is subjective and depends on Claude's analysis quality. Results should be treated as directional, not authoritative.

## Estimated Effort

- Step 1 (scripts): 1-2 hours
- Step 2 (task): 2-3 hours
- Step 3 (prompt): 1-2 hours (iteration + testing)
- Step 4 (API): 30 min
- Step 5 (Slack): 30 min
- Testing & iteration: 2-3 hours

**Total: ~1 day of work**
