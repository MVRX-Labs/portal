# Lead Enrichment & Scoring

## Goal

Extend the linkedin-engagement-scrape → lead upsert pipeline with richer lead data:
email, phone, region, clean title, division, rationale, tier ranking, conversion %.

## Changes

### 1. Fix company extraction (bug)

- Add `parseCompanyFromHeadline()` to `src/lib/linkedin-engagement.ts`
- Use as fallback in `normalizeEngagers()` when Apify actors don't return a separate company field
- Fix `linkedin-lead-upsert.ts:175` where comments hardcode `company: null` — extract from headline instead

### 2. Schema: new fields on `leads` table

- `email` (text, nullable) — populated by Apollo later
- `phone` (text, nullable) — populated by Apollo later
- `region` (text, nullable) — from profile scrape or enrichment
- `title` (text, nullable) — clean job title parsed from headline
- `division` (text, nullable) — department extracted from title
- `rationale` (text, nullable) — AI-generated ICP fit explanation
- `tier` (integer, nullable) — 1/2/3
- `conversionPct` (integer, nullable) — 0–100
- `enrichedAt` (timestamp, nullable) — when enrichment last ran

### 3. Schema: new `icp_definitions` table

- `id`, `accountId` (FK → accounts)
- `name` — e.g. "Enterprise SaaS", "SMB Fintech"
- `description` — natural language ICP description
- `targetTitles` (jsonb string[])
- `targetIndustries` (jsonb string[])
- `targetCompanySizes` (jsonb string[])
- `targetSignals` (jsonb string[])
- `createdAt`, `updatedAt`

### 4. Headline parsing utilities

- `parseCompanyFromHeadline()` — patterns: "at Company", "| Company", "@ Company"
- `parseTitleFromHeadline()` — extract clean job title
- `parseDivisionFromTitle()` — map title keywords to departments

### 5. Populate new fields during lead upsert

- Parse title, company, division from headline at upsert time
- Store on lead record

### 6. Stubs for future enrichment

- `enrichLeadContact()` — stub for Apollo email/phone lookup
- `scoreLeadConversion()` — stub for conversion % estimation
- `rankLeadTier()` — stub for AI tier ranking + rationale generation

### 7. Update API schema

- Add new fields to `leadSchema` in `src/lib/api-schemas/leads.ts`
