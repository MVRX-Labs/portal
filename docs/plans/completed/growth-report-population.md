# Growth Report Population Job

**Status: IMPLEMENTED**

## What Was Built

A Trigger.dev task (`growth-report-generation`) that takes an account and produces a fully populated growth report DOCX, uploaded to Google Drive.

### Pipeline

```
Phase 1: Research & Discovery (Claude Sonnet Agent — WebSearch + WebFetch)
  → Discovers competitors, category queries, social handles, Trustpilot URL

Phase 2: Parallel Data Collection (Apify scrapers)
  → SimilarWeb, Ahrefs, SEO audit, LinkedIn profiles/posts, Instagram, TikTok,
     robots.txt/llms.txt, Google SERP, Trustpilot, Crunchbase, Tracxn, Reddit

Phase 3: Analysis & Generation (Claude Opus Agent — Read + Glob)
  → All raw data → GrowthReportContent JSON

Phase 4: Build & Deliver
  → buildGrowthReportDocx() → upload to Google Drive → Slack notification
```

### Key files

```
src/trigger/growth-report.ts              — Main orchestrator task
src/lib/growth-report/
├── schema.ts                             — TypeScript interfaces
├── styles.ts                             — DOCX styling helpers
├── builder.ts                            — DOCX assembly
├── sections/                             — Section builders (cover, commercial, social, etc.)
├── discovery.ts                          — Phase 1: Claude research agent
├── scrapers.ts                           — Phase 2: All Apify calls + direct fetches
├── analysis-prompt.ts                    — Phase 3: Claude analysis prompt
├── review-prompt.ts                      — Phase 4: Claude review/cleanup
├── screenshots.ts                        — Screenshot capture + evaluation
├── take-screenshots.ts                   — Screenshot helper
└── constants.ts                          — MVRX case studies, pricing components
```

### Cost per report: ~$6–7 (Apify actors + Claude Sonnet/Opus calls)
### Runtime: ~3–6 minutes
