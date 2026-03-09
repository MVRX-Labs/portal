# Agent API Access

How to interact with the MVRX system programmatically from local agents (Claude Code, scripts, etc).

There are two interfaces: the **NextJS API** (for CRUD and triggering tools) and **Trigger.dev** (for running background jobs directly).

## Setup

Add these to your `.env.local`:

```env
AGENT_API_KEY=<generate a random secret, e.g. openssl rand -hex 32>
AGENT_USER_ID=<your user ID from the database, e.g. user_abc123>
AGENT_USER_NAME=Danny
AGENT_USER_EMAIL=danny@mvrxlabs.com
```

For production, set the same variables in Vercel environment settings. (I haven't done this yet)

## NextJS API

All API routes accept an `x-api-key` header. When it matches `AGENT_API_KEY`, session auth is bypassed and the request runs as the configured agent user with admin access.

### Authentication

```bash
# Every request needs this header
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/accounts
```

For production, replace `http://localhost:3000` with your Vercel domain.

### Accounts

```bash
# List all accounts
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/accounts

# Search accounts by name
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/accounts?q=acme"

# Get single account (by ID or slug)
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/accounts/acme-corp

# Create account
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "industry": "SaaS", "website": "https://acme.com"}' \
  http://localhost:3000/api/accounts

# Update account
curl -X PUT -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"industry": "Fintech", "mrr": 5000}' \
  http://localhost:3000/api/accounts/<id>
```

### Contacts

```bash
# List contacts (optionally filtered by account)
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/contacts?accountId=<id>"

# Create contact
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "accountId": "<id>", "linkedinUrl": "https://linkedin.com/in/janedoe"}' \
  http://localhost:3000/api/contacts

# Update contact
curl -X PUT -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"linkedinUrl": "https://linkedin.com/in/janedoe"}' \
  http://localhost:3000/api/contacts/<id>
```

### Leads

```bash
# List leads for an account (paginated)
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/accounts/<id>/leads?page=1&limit=50"

# Export leads as CSV
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/accounts/<id>/leads/export

# Trigger engagement scraping for an account
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/api/accounts/<id>/leads/scrape
```

### Tools (trigger background AI jobs via the API)

All tool endpoints return `{ id, status: "running", triggerRunId, publicAccessToken }`.

```bash
# LinkedIn audit
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"contactId": "<id>"}' \
  http://localhost:3000/api/tools/linkedin-audit

# LinkedIn post generator
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"contactId": "<id>", "sourceMaterial": "We just launched a new feature..."}' \
  http://localhost:3000/api/tools/linkedin-post-generator

# LinkedIn humanizer
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"postContent": "Your AI-generated post text...", "tone": "professional"}' \
  http://localhost:3000/api/tools/linkedin-humanizer

# Sentiment analysis
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"productName": "Acme Platform", "sources": "all"}' \
  http://localhost:3000/api/tools/sentiment-analysis

# GTM strategy
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"industry": "SaaS", "targetAudience": "SMBs", "productDescription": "A CRM for..."}' \
  http://localhost:3000/api/tools/gtm-strategy

# Outbound sequence
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs": {...}}' \
  http://localhost:3000/api/tools/outbound-sequence
```

### Checking run status

```bash
# Poll a run by its ID (returned from tool endpoints)
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/runs/<runId>
```

Returns `status` ("running", "completed", "failed"), `output`, `error`, and `triggerRunId`.

### Account Actions

```bash
# List actions for an account
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/accounts/<id>/actions?includeCompleted=true"

# Create action
curl -X POST -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"title": "Follow up on proposal", "dueDate": "2026-03-10"}' \
  http://localhost:3000/api/accounts/<id>/actions

# Update action
curl -X PUT -H "x-api-key: $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"status": "completed"}' \
  http://localhost:3000/api/accounts/<id>/actions/<actionId>

# Delete action
curl -X DELETE -H "x-api-key: $AGENT_API_KEY" \
  http://localhost:3000/api/accounts/<id>/actions/<actionId>
```

### Admin

```bash
# List users
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/admin/users

# Trigger calendar sync
curl -X POST -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/admin/calendar-sync

# Calendar events / sync state / stats
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/admin/calendar-events?view=stats"
```

### History

```bash
# List all tool runs (paginated, filterable)
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/history?limit=20&tool=linkedin-audit&status=completed"
```

### Resources (Google Drive)

```bash
# List files in an account's Drive folder
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/resources?accountId=<id>"

# Get/export a file
curl -H "x-api-key: $AGENT_API_KEY" "http://localhost:3000/api/resources/<fileId>?action=export"
```

---

## Trigger.dev (direct task triggering)

You can also trigger background jobs directly via the Trigger.dev MCP or SDK, bypassing the NextJS API entirely. This is useful when you don't need a `toolRun` record in the database.

### Available tasks

| Task ID                         | Payload                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `gtm-strategy-generation`       | `{ runId, companyName, industry, targetAudience, productDescription, model?, accountName? }`                                |
| `linkedin-audit-generation`     | `{ runId, linkedinUrl, model?, accountName? }`                                                                              |
| `linkedin-post-generator`       | `{ runId, posterName, posterRole, sourceMaterial, voiceContext?, linkedinUrl?, useLinkedinProfile?, model?, accountName? }` |
| `linkedin-humanizer`            | `{ runId, postContent, tone, writingExamples?, model? }`                                                                    |
| `sentiment-analysis-generation` | `{ runId, productName, companyName, sources, additionalUrls, keywords, model?, accountName? }`                              |
| `linkedin-engagement-scrape`    | `{ accountId, contactId, linkedinUrl, sourceType: "company"\|"personal", runId? }`                                          |
| `account-enrichment`            | `{ accountId, domain }`                                                                                                     |
| `calendar-sync`                 | (no payload — scheduled task, but can be triggered manually)                                                                |
| `calendar-meeting-notifier`     | (no payload — scheduled task; includes AI briefing with talking points + agenda for linked accounts)                         |
| `linkedin-engagement-scheduler` | (no payload — scheduled task)                                                                                               |

### Via Trigger.dev MCP

If you have the Trigger.dev MCP server configured, you can trigger tasks directly:

```
trigger_task(taskId: "linkedin-audit-generation", payload: { runId: "test-123", linkedinUrl: "https://linkedin.com/in/example" }, environment: "dev")
```

### Via Trigger.dev SDK (in scripts)

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

await tasks.trigger("account-enrichment", {
  accountId: "acc_123",
  domain: "acme.com",
});
```

Note: when triggering tasks directly, the `runId` field in the payload won't correspond to a real `toolRuns` record unless you create one yourself. For tasks like `linkedin-engagement-scrape` and `account-enrichment` that don't require a `runId`, this is fine. For the AI tool tasks, they'll try to update a `toolRuns` record with that ID, so either create one first via the DB or use the NextJS API endpoints instead.
