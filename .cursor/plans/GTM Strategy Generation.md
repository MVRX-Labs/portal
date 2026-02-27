# GTM Strategy Generator - Implementation Plan

## Context

The MVRX Labs platform has a working LinkedIn Profile Audit tool that scrapes LinkedIn via Apify, sends data to a local-api running Claude Agent SDK, generates structured JSON, builds a .docx via a programmatic builder, and saves it to Google Drive. A GTM Strategy Generator tool already has a stub frontend page and API route but no actual processing. This plan implements the full GTM pipeline following the same proven pattern, with Claude doing real-time web research to produce a comprehensive launch strategy document matching the HelmGuard PDF format.

## Data Flow

```
User submits form (companyName, industry, targetAudience, productDescription)
  -> POST /api/tools/gtm-strategy (Next.js)
    -> Insert DB record (status: "running")
    -> POST to local-api /api/jobs/gtm-strategy
      -> 202 accepted immediately
      -> runClaudeJob() with WebSearch + WebFetch + Read tools
        -> Claude researches company, competitors, market (7+ web searches)
        -> Claude outputs structured JSON matching GTMStrategyContent schema
      -> postProcess:
        -> extractJSON() from Claude output
        -> Parse as GTMStrategyContent
        -> buildGtmDocx(content) -> Buffer
        -> writeFile() to Google Drive shared folder
      -> Callback to /api/hooks/job-complete
```

## Files to Create

### 1. `local-api/src/lib/gtm-schema.ts` — TypeScript interfaces

Strongly-typed section interfaces (not generic ContentBlock arrays) because every section in the PDF has a unique structure (scores, competitor cards, channel details, timelines):

- `GTMStrategyContent` — top-level with: companyName, industry, targetAudience, preparedDate, preparedFor
- `SituationOverview` — summary, whatsWorking[], theChallenge[], keyObservation, strategicPriorities[]
- `PresenceAudit` — websiteScore/Assessment, seoScore/Assessment, socialMediaScore/Assessment, overallAssessment
- `CompetitiveLandscape` — competitors[] (name, positioning, strengths[], weaknesses[], keyTakeaway), strategicPosition, positioningTakeaways[]
- `ChannelStrategyOverview` — recommendedChannels[] (name, fitScore, rationale), whyNotOtherChannels[], howChannelsWorkTogether
- `ChannelDetail[]` (x3) — channelName, investment, timeToResults, keyMetric, strategicRationale, keyTactics[], twelveWeekPlan[] (week, actions[])
- `ExecutionRoadmap` — months[] (x3: month, theme, actions[], checkpoint)
- `SuccessMetrics` — growthTargets[] (metric, current, day30, day60, day90), trackingNotes
- `NextSteps` — immediateActions[], ctaParagraph, mvrxValueProp
- Also re-declare `ContentBlock` and `BulletItem` types (same as audit-schema, for any free-form blocks)

### 2. `local-api/src/lib/gtm-docx-builder.ts` — Docx builder (~600-700 lines)

Follows `audit-docx-builder.ts` pattern. Copies design tokens and helpers (keeps independent, no shared imports). Key sections:

- **Design tokens**: Same `FONT`, `C` (colors), `S` (sizes) from audit builder, plus additions for channel headings, TOC, cover subtitle
- **Helpers**: `tr()`, `textRuns()`, `emptyPara()`, `CELL_BORDERS`, `scoreColor()` — copied from audit builder
- **Cover page**: "MVRX LABS" branding, company name, "Go-To-Market Launch Strategy", prepared for/date
- **Table of Contents**: Styled section list (section numbers + titles, no page numbers)
- **Situation Overview**: Summary paragraph, bullet lists for what's working/challenge, labeled key observation, numbered priorities
- **Presence Audit**: 3-row score table (Website/SEO/Social Media) with colored score cells using `scoreColor()`
- **Competitor Cards**: Per-competitor blocks with name subheading, positioning paragraph, strengths/weaknesses bullet lists, italic takeaway
- **Channel Overview Table**: 3 rows with channel name, fit score (colored), rationale
- **Channel Detail Sections**: Page-break per channel, 3-column stats table (Investment | Time | Metric), tactics bullet list, 12-week plan table (Week | Actions)
- **90-Day Roadmap**: Month heading + theme subtitle, action bullet list, bold "Checkpoint:" labeled paragraph
- **Growth Targets Table**: 5-column data table (Metric | Current | Day 30 | Day 60 | Day 90)
- **Sign-off**: Same MVRX Labs sign-off as audit builder

Export: `buildGtmDocx(content: GTMStrategyContent): Promise<Buffer>`

## Files to Modify

### 3. `local-api/src/routes/jobs.ts` — Add GTM route handler

Add after the LinkedIn audit section:

- Import `buildGtmDocx` and `GTMStrategyContent`
- Define `GTM_PROMPT()` template function — two-phase prompt:
  - **Research phase**: Instructs Claude to WebSearch for the company, competitors (3-4), market landscape, industry channels, trends. Minimum 7 searches.
  - **Generation phase**: Output structured JSON matching `GTMStrategyContent` schema (full schema embedded in prompt)
- `router.post("/gtm-strategy", ...)` handler:
  - Accepts: runId, companyName, industry, targetAudience, productDescription, callbackUrl
  - Calls `runClaudeJob()` with model `OPUS_MODEL`, maxTurns `25`, allowedTools `["WebSearch", "WebFetch", "Read"]`
  - `postProcess`: extractJSON → parse → `buildGtmDocx()` → write to `OUTPUT_DIR` as `MVRX | {companyName} | GTM Strategy.docx`

Reuses existing: `extractJSON()`, `currentMonth()`, `OUTPUT_DIR`, `OPUS_MODEL`, `log()`

### 4. `src/app/api/tools/gtm-strategy/route.ts` — Replace stub with dispatch handler

Replace the 5-line `createToolHandler` stub. Follow the LinkedIn audit route pattern:

- Validate all 4 required fields (companyName, industry, targetAudience, productDescription)
- Insert `toolRuns` record with status `"running"`
- Build callback URL from request headers
- POST to `${NGROK_BASE_URL}/api/jobs/gtm-strategy` with all inputs + runId + callbackUrl
- Error handling: update DB to failed, send Slack notification

## No Changes Needed

- `src/app/tools/gtm-strategy/page.tsx` — Already works (uses shared ToolForm)
- `src/lib/types.ts` — GTM tool config already defined with correct fields
- `src/components/tool-form.tsx` — Generic, handles polling/status display
- `src/app/api/hooks/job-complete/route.ts` — Generic callback handler, works for any tool
- `local-api/src/lib/claude-runner.ts` — Generic job runner, no changes needed
- `local-api/src/index.ts` — Already mounts jobs router

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model | `claude-opus-4-6` | Research + long-form strategy needs strong reasoning |
| Max turns | 25 | ~7 web searches + fetches + JSON generation |
| Allowed tools | WebSearch, WebFetch, Read | Full web research capability |
| JSON extraction | Reuse existing `extractJSON()` | Handles fenced/bare JSON, with session dir fallback |
| Docx builder | Independent from audit builder | Copies tokens/helpers but no shared imports; GTM sections are structurally different |
| Output filename | `MVRX | {companyName} | GTM Strategy.docx` | Matches existing naming pattern |

## Verification

1. **Build check**: `cd local-api && npm run build` — ensure new files compile
2. **Start local-api**: `cd local-api && npm run dev` — verify server starts with new route
3. **Start Next.js**: `npm run dev` — verify GTM tool page loads at `/tools/gtm-strategy`
4. **End-to-end test**: Submit the form with a real company name → verify:
   - DB record created with status "running"
   - Local-api receives and accepts the job
   - Claude performs web searches (visible in local-api logs)
   - JSON is extracted and parsed successfully
   - .docx file appears in Google Drive shared folder
   - Callback updates DB record to "completed"
   - Frontend shows completion status with output message
5. **Open the .docx**: Verify formatting matches the HelmGuard PDF structure (cover page, TOC, scored sections, channel details, roadmap, metrics)
