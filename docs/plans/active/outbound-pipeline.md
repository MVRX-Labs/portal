# Outbound Pipeline — Auto-Generated Value-Add Materials + Campaign Execution

## Context

The portal currently manages **client** GTM activities. MVRX Labs wants to use the same platform for **any account's own outbound** — discovering leads via engagement scraping, auto-generating value-add materials (LinkedIn audits, GTM strategies), and executing outbound campaigns via HeyReach. Each touchpoint in a campaign should deliver value (e.g., a personalized audit, a GTM strategy for their company). This is a **general-purpose feature** available to any account, not MVRX-specific.

## Current State

**Works today:**

- Lead discovery via engagement scraping (daily, automated)
- LinkedIn audit generation (manual, requires `contactId` — not `leadId`)
- GTM strategy generation (manual, standalone — not tied to leads/accounts)
- Engagement bot (monitor profiles, review posts in Slack)
- HeyReach MCP integration available

**Key gaps:**

1. LinkedIn audit can't be triggered for leads (only contacts)
2. GTM strategy not linked to leads or their companies
3. No lead stages or pipeline tracking
4. No auto-generation pipeline (discover → generate materials)
5. No outbound campaign concept or HeyReach execution
6. Generated materials not stored on lead records for reuse in messaging

## Decisions

- **Outbound tool:** HeyReach (for now)
- **Value-add model:** Each touchpoint adds value — audit findings referenced in messages, GTM doc shared as follow-up, etc.
- **Scope:** General-purpose (any account can use it)
- **Budget:** Not a concern right now. Use Opus for audits (best quality). Lead qualification will be automated later but is manual/simple for now.

---

## Phase 1: Lead Stages + Audit/GTM for Leads (Foundation)

**Goal:** Let users trigger audits and GTM strategies directly for leads, track pipeline stages.

### 1a. Schema changes (`src/lib/schema.ts`)

Add columns to `leads` table:

```
stage: text, default "discovered"
  → "discovered" | "qualified" | "materials_pending" | "outreach_ready" | "in_campaign" | "replied" | "disqualified"
qualificationScore: integer, default 0
auditRunId: text, nullable (FK to toolRuns)
auditDriveUrl: text, nullable
auditSummary: jsonb, nullable  // structured highlights for message personalization
gtmRunId: text, nullable (FK to toolRuns)
gtmDriveUrl: text, nullable
disqualifiedReason: text, nullable
```

New table `outbound_campaigns`:

```
id (ocamp_*), accountId, name, status (draft|active|paused|completed),
heyreachCampaignId, heyreachListId, targetDescription,
messageTemplates (jsonb), autoGenerateAudit (bool, default false),
leadsCount (int), leadsResponded (int),
createdAt, updatedAt
```

New junction table `outbound_campaign_leads`:

```
id (ocl_*), campaignId, leadId,
status (pending|added_to_heyreach|contacted|replied|converted),
personalizedMessage (text, nullable),
addedAt, contactedAt (nullable), repliedAt (nullable)
unique(campaignId, leadId)
```

### 1b. ID prefixes (`src/lib/ids.ts`)

Add: `ocamp`, `ocl` with corresponding types.

### 1c. Modify LinkedIn audit to accept `leadId`

**`src/lib/api-schemas/tools.ts`** — Update schema:

- Accept `leadId` as alternative to `contactId` (one required via `.refine()`)

**`src/app/api/tools/linkedin-audit/route.ts`** — When `leadId` provided:

- Look up lead for `linkedinUrl` (instead of contact)
- Use lead's `company` as the account name context
- Pass `leadId` through to trigger payload

**`src/trigger/linkedin-audit.ts`** — Add optional `leadId` to `LinkedInAuditPayload`:

- On completion: update `leads.auditRunId`, `leads.auditDriveUrl`, `leads.stage`
- Extract audit summary (overallScore, top strength, top weakness, quick wins count) → store in `leads.auditSummary`

New helper: **`src/lib/audit-summary.ts`** — `extractAuditSummary(content: LinkedInAuditContent)` returns structured summary for message personalization.

### 1d. Modify GTM strategy to accept `leadId`

**`src/lib/api-schemas/tools.ts`** — Add optional `leadId` to GTM schema. Make `industry`/`targetAudience`/`productDescription` optional when `leadId` present (inferred from lead data).

**`src/app/api/tools/gtm-strategy/route.ts`** — When `leadId` provided:

- Auto-populate from lead's `company` + `headline` + parent account's `industry`
- Deduplicate: if another lead with same `company` already has a `gtmDriveUrl`, reuse it

**`src/trigger/gtm-strategy.ts`** — Add optional `leadId`:

- On completion: update `leads.gtmRunId`, `leads.gtmDriveUrl`

### 1e. Leads page UI enhancements

- Add stage column with color-coded badges
- Add action buttons per lead: "Generate Audit", "Generate GTM", "Add to Campaign"
- Add stage filter dropdown
- Add bulk selection for batch operations

---

## Phase 2: Auto-Generation Pipeline

**Goal:** When leads are discovered, optionally auto-generate materials for them.

### 2a. Lead qualification logic (`src/lib/lead-qualification.ts`)

Simple scoring (0-10) — designed as a hook for future automation:

- +1 per distinct engagement type (max 3: reaction, comment, repost)
- +1 per additional post engaged with (capped at +3)
- +2 if lastSeenAt within 7 days, +1 if within 30 days
- -2 if company matches existing client account (don't pitch clients)

### 2b. Qualification trigger task (`src/trigger/lead-qualification.ts`)

- Receives batch of lead IDs after engagement scrape
- Computes scores, updates `qualificationScore` and `stage`
- For leads crossing threshold on accounts with `autoGenerateAudit` enabled: triggers audit (Opus)

### 2c. Integration with engagement scraper (`src/trigger/linkedin-engagement-scrape.ts`)

After upserting leads, chain to `lead-qualification` task with new/updated lead IDs (~5 lines).

---

## Phase 3: Campaign Management + HeyReach Integration

**Goal:** Create outbound campaigns, push qualified leads with personalized value-add messages to HeyReach.

### 3a. HeyReach client (`src/lib/heyreach.ts`)

Wraps HeyReach REST API for use in Trigger tasks:

- `createList`, `addLeadsToList`, `addLeadsToCampaign`
- `getCampaignStats`, `getConversations`
- Based on MCP tool signatures (already available for reference)

### 3b. Message personalization (`src/lib/outbound-personalization.ts`)

Claude Sonnet generates personalized outbound messages per touchpoint:

- Template + audit summary + GTM highlights → humanized, personalized message
- Each touchpoint type (connection request, follow-up with audit, follow-up with GTM) gets distinct value framing
- Respects LinkedIn character limits

### 3c. Campaign push task (`src/trigger/outbound-campaign-push.ts`)

- Loads `outreach_ready` leads in campaign
- Generates personalized messages per lead
- Pushes to HeyReach list/campaign via REST API
- Updates lead stages to `in_campaign`

### 3d. Reply tracker task (`src/trigger/outbound-reply-tracker.ts`)

Scheduled daily — checks HeyReach conversations, matches replies to leads, updates stages, sends Slack summary.

### 3e. Campaign API routes + UI

**Routes:**

- `GET/POST /api/outbound/campaigns` — CRUD
- `GET/PUT /api/outbound/campaigns/[id]` — detail/update
- `POST /api/outbound/campaigns/[id]/push` — trigger push to HeyReach
- `GET /api/outbound/campaigns/[id]/leads` — leads in campaign

**Zod schemas:** `src/lib/api-schemas/outbound.ts`

**UI:** New `/outbound` page with campaign list, create form, detail view with lead pipeline visualization.

---

## Files to Create

| File                                                 | Purpose                                    |
| ---------------------------------------------------- | ------------------------------------------ |
| `src/lib/lead-qualification.ts`                      | Scoring logic                              |
| `src/lib/audit-summary.ts`                           | Extract structured summary from audit JSON |
| `src/lib/heyreach.ts`                                | HeyReach REST API client                   |
| `src/lib/outbound-personalization.ts`                | AI message personalization                 |
| `src/lib/api-schemas/outbound.ts`                    | Campaign Zod schemas                       |
| `src/trigger/lead-qualification.ts`                  | Score leads + auto-trigger materials       |
| `src/trigger/outbound-campaign-push.ts`              | Push leads to HeyReach                     |
| `src/trigger/outbound-reply-tracker.ts`              | Track campaign replies                     |
| `src/app/api/outbound/campaigns/route.ts`            | Campaign list/create                       |
| `src/app/api/outbound/campaigns/[id]/route.ts`       | Campaign detail/update                     |
| `src/app/api/outbound/campaigns/[id]/push/route.ts`  | Campaign push                              |
| `src/app/api/outbound/campaigns/[id]/leads/route.ts` | Campaign leads                             |
| `src/app/outbound/page.tsx`                          | Campaign management UI                     |
| `drizzle/NNNN_outbound_pipeline.sql`                 | Migration                                  |

## Files to Modify

| File                                        | Change                                     |
| ------------------------------------------- | ------------------------------------------ |
| `src/lib/schema.ts`                         | Add lead columns + outbound tables         |
| `src/lib/ids.ts`                            | Add `ocamp`, `ocl` prefixes + types        |
| `src/lib/api-schemas/tools.ts`              | Add `leadId` to audit/GTM schemas          |
| `src/app/api/tools/linkedin-audit/route.ts` | Support `leadId` lookup path               |
| `src/trigger/linkedin-audit.ts`             | Accept `leadId`, update lead on completion |
| `src/app/api/tools/gtm-strategy/route.ts`   | Support `leadId` lookup path               |
| `src/trigger/gtm-strategy.ts`               | Accept `leadId`, update lead on completion |
| `src/trigger/linkedin-engagement-scrape.ts` | Chain to qualification task                |
| Leads page component(s)                     | Stage badges, actions, filters             |

## Verification

1. **Phase 1:** Trigger audit for a lead via API → DOCX generated → lead record has `auditDriveUrl` and `auditSummary` populated → stage updated
2. **Phase 2:** Run engagement scrape → new leads scored → qualified leads auto-trigger audit → materials generated
3. **Phase 3:** Create campaign → add leads → push to HeyReach → leads appear in HeyReach with personalized messages → reply tracker updates stages
