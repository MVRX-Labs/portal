# Plan: GEO Audit Trigger.dev Task

**Status: IMPLEMENTED (v1)**

## Goal

Create a Trigger.dev task that performs a Generative Engine Optimization (GEO) audit on a given URL, producing a scored report analyzing how well a site is optimized for AI-powered search engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews).

Based on the open-source skill at [github.com/zubair-trabzada/geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude).

## Architecture Decision

**Approach: Port audit methodology to TypeScript/Node using `src/lib/geo-audit/` helpers.**

The Python scripts from the original skill were ported to TypeScript to avoid a Python runtime dependency in the Trigger.dev container:

- `src/lib/geo-audit/fetch-page.ts` — page fetching, HTML parsing, robots.txt/llms.txt checking
- `src/lib/geo-audit/citability-scorer.ts` — AI citation readiness scoring
- `src/lib/geo-audit/brand-scanner.ts` — brand presence scanner
- `src/lib/geo-audit/llmstxt-validator.ts` — llms.txt validation

Uses `runClaudeAgent()` from `src/lib/claude-agent.ts` with `Read`, `Write`, `WebSearch`, `WebFetch` tools. This matches the existing `account-enrichment` and `linkedin-audit` patterns.

## Scoring Model

```
GEO_Score = (Citability × 0.25) + (Brand Authority × 0.20) + (Content/E-E-A-T × 0.20)
          + (Technical × 0.15) + (Schema × 0.10) + (Platform Optimization × 0.10)
```

## Implementation

- **Task:** `src/trigger/geo-audit.ts` — task ID `geo-audit`
- **Lib:** `src/lib/geo-audit/` — TypeScript helpers for page fetch, scoring, brand scanning
- **DOCX:** `src/lib/geo-audit-docx/` — report builder
- **API:** handled via standard tools route pattern
- **Storage:** report uploaded to Google Drive; Slack notification on completion/failure
