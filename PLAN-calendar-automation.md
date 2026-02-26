# Automated LinkedIn Audits from Google Calendar

## Context

LinkedIn audits take 1-2 minutes and cost ~$1-2.50 each. Currently they're triggered manually via the web UI. The goal is to automatically run them for external attendees on team Google Calendar meetings, so audit reports are ready in the shared Google Drive folder before meetings happen.

## Architecture Overview

```
Vercel Cron (every 5 min)
  → GET /api/cron/calendar-sync
  → Google Calendar API (incremental sync via syncToken)
  → Extract external attendees (filter by domain)
  → Insert new contacts + queue records in DB
  → Dispatch "contact-resolution" jobs to local-api

local-api: Claude Agent + WebSearch
  → Resolves email → LinkedIn URL + company
  → Callback to /api/hooks/job-complete

Next.js callback handler (on resolution complete)
  → Updates contact record
  → Dispatches LinkedIn audit job to local-api (existing flow)

local-api: Claude Agent (existing linkedin-audit job)
  → Generates .docx audit → Google Drive
  → Callback to /api/hooks/job-complete
```

## Key Design Decisions

- **Polling, not webhooks** — Vercel Cron every 5 min. Google Calendar push notifications are complex (channel expiry, renewal) and 5-min latency is fine for meeting prep.
- **Claude web search for enrichment** — Instead of Apollo/Proxycurl, a Claude Agent with WebSearch resolves emails to LinkedIn URLs. Uses existing local-api infrastructure.
- **2-month dedup** — Contacts audited within the last 60 days are skipped.
- **Chained jobs** — Resolution callback automatically triggers audit dispatch. No separate queue processor needed.
- **Sequential processing** — Max 2 concurrent jobs on local-api to avoid rate limits.

---

## Implementation Steps

### 1. New database tables (`src/lib/schema.ts`)

```
contacts
  - id (cuid)
  - email (unique)
  - fullName
  - linkedinUrl (nullable)
  - companyName (nullable)
  - resolvedAt (nullable timestamp)
  - resolutionRunId (nullable, FK to toolRuns)
  - lastAuditedAt (nullable timestamp)
  - lastAuditRunId (nullable, FK to toolRuns)
  - createdAt, updatedAt

calendarEvents
  - id (cuid)
  - calendarId (text)
  - googleEventId (text, unique)
  - summary (text)
  - startTime (timestamp)
  - processedAt (timestamp)
  - createdAt

calendarEventContacts (junction)
  - id (cuid)
  - eventId (FK to calendarEvents)
  - contactId (FK to contacts)
  - createdAt
```

### 2. Google Calendar API integration (`src/lib/calendar.ts`)

- Extend existing Google service account auth (from `src/lib/gdrive.ts`) to include `calendar.readonly` scope
- Use domain-wide delegation to access team calendars
- Implement incremental sync using `syncToken` (stored in a simple `calendarSyncState` DB table or JSON column)
- `MONITORED_CALENDARS` env var: comma-separated calendar IDs
- `INTERNAL_DOMAINS` env var: domains to filter out (e.g., `mvrx.co`)
- Filter out `resource.calendar.google.com` and `group.calendar.google.com` addresses

### 3. Calendar sync cron endpoint (`src/app/api/cron/calendar-sync/route.ts`)

- `GET` handler, authenticated via `CRON_SECRET` header (Vercel Cron sends this)
- For each monitored calendar:
  - Fetch events changed since last sync (using syncToken, or full sync on first run with `timeMin=now`)
  - Extract external attendees from each event
  - For each new email not in `contacts` table, or where `lastAuditedAt` is older than 60 days:
    - Upsert into `contacts` table
    - Create `calendarEvents` + `calendarEventContacts` records
    - Dispatch a contact-resolution job to local-api
- Update stored syncToken
- Add to `vercel.json`: cron schedule `*/5 * * * *`

### 4. Contact resolution job (`local-api/src/routes/jobs.ts`)

New endpoint: `POST /api/jobs/contact-resolution`

- Input: `{ runId, email, fullName, callbackUrl }`
- Claude prompt: "Find the LinkedIn profile URL and current company for this person: {fullName} ({email}). Return ONLY a JSON object: `{ linkedinUrl, companyName }`. Use web search to find their profile."
- Model: `claude-haiku-4-5-20251001` with `WebSearch` tool allowed
- Max turns: 10 (this should be quick)
- Callback sends the JSON result as `output`

### 5. Enhanced callback handler (`src/app/api/hooks/job-complete/route.ts`)

Currently just updates `toolRuns`. Extend to:

- When a `contact-resolution` run completes successfully:
  - Parse the JSON output (linkedinUrl, companyName)
  - Update the `contacts` record with resolved data
  - If linkedinUrl was found: automatically dispatch a LinkedIn audit job
    - Reuse the scraping + dispatch logic from `src/app/api/tools/linkedin-audit/route.ts` (extract into shared function)
  - If not found: mark contact as unresolvable, send Slack notification
- When a `linkedin-audit` run completes:
  - Update `contacts.lastAuditedAt` and `contacts.lastAuditRunId`
  - Existing behavior (update toolRun) stays the same

### 6. Extract reusable audit dispatch function (`src/lib/linkedin-audit.ts`)

Currently the scraping + dispatch logic lives inline in the route handler. Extract into:

```typescript
export async function dispatchLinkedInAudit(params: {
  linkedinUrl: string;
  companyName: string;
  userId: string;  // system user for automated runs
}): Promise<{ runId: string }>
```

This function:
- Scrapes via Apify (existing `scrapeLinkedInProfile`)
- Creates a `toolRuns` record
- Dispatches to local-api
- Returns the run ID

Used by both the manual route handler AND the automated callback.

### 7. System user for automated runs

Automated audits need a `userId` for the `toolRuns` record. Options:
- Create a "system" user in the `users` table on setup
- Or use a designated admin user's ID via env var `SYSTEM_USER_ID`

### 8. Middleware updates (`src/middleware.ts`)

Add to public paths (no session auth required):
- `/api/cron/calendar-sync` (authenticated via CRON_SECRET)

### 9. Rate limiting / concurrency

- The cron endpoint should check how many `toolRuns` are currently `running` for `linkedin-audit` and `contact-resolution`
- If more than 2 are running, skip dispatching new ones (they'll be picked up next cron cycle)
- This prevents overwhelming local-api or Apify

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/calendar.ts` | Google Calendar API client (auth, sync, event fetching) |
| `src/app/api/cron/calendar-sync/route.ts` | Vercel Cron endpoint |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/schema.ts` | Add `contacts`, `calendarEvents`, `calendarEventContacts`, `calendarSyncState` tables |
| `src/lib/linkedin-audit.ts` | Extract `dispatchLinkedInAudit()` function |
| `src/app/api/tools/linkedin-audit/route.ts` | Use extracted dispatch function |
| `src/app/api/hooks/job-complete/route.ts` | Chain resolution → audit, update contacts |
| `src/middleware.ts` | Add cron path to public routes |
| `local-api/src/routes/jobs.ts` | Add `contact-resolution` job endpoint |
| `vercel.json` | Add cron schedule |

## Environment Variables

```
MONITORED_CALENDARS=team-member@company.com,other@company.com
INTERNAL_DOMAINS=mvrx.co
CRON_SECRET=<generated-secret>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<existing>
GOOGLE_PRIVATE_KEY=<existing>
SYSTEM_USER_ID=<admin-user-cuid>
```

## Verification

1. **Unit**: Add a contact resolution job manually via curl to local-api, verify it returns LinkedIn URL
2. **Integration**: Trigger the cron endpoint manually (`curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/calendar-sync`), verify it detects events and creates contact records
3. **End-to-end**: Create a test calendar event with an external attendee, wait for cron, verify the full chain: detection → resolution → audit → .docx in Google Drive
4. **Dedup**: Run cron again, verify the same contact is skipped
5. **Error cases**: Test with an unresolvable email, verify Slack notification and graceful handling
