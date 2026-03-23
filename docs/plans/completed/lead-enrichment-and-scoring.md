# Lead Enrichment & Scoring

**Status: IMPLEMENTED**

## What Was Built

Extended the lead upsert pipeline with richer lead data and added ICP definition management.

### Schema changes (all implemented)

New fields on `leads` table:
- `title` — clean job title parsed from headline
- `division` — department extracted from title
- `region` — geographic region
- `email` — from enrichment provider (stub, populated by Apollo)
- `phone` — from enrichment provider (stub)
- `rationale` — AI-generated ICP fit explanation
- `tier` — 1/2/3 priority tier
- `conversionPct` — 0–100 estimated conversion likelihood
- `enrichedAt` — when enrichment last ran

New `icp_definitions` table:
- Per-account ICP definitions with name, description, targetTitles, targetIndustries, targetCompanySizes, targetSignals

### Implementation files

- `src/lib/lead-enrichment.ts` — enrichment helpers and headline parsing utilities
- `src/lib/api-schemas/leads.ts` — updated with new fields
- `src/lib/api-schemas/icp-definitions.ts` — Zod schema for ICP definitions
- API routes for ICP definitions: `GET/POST /api/accounts/[id]/icp-definitions`
