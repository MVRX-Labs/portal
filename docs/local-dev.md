# Local Development

## First-Time Setup

```bash
cp .env.example .env.local   # Fill in required values
npm install
npm run setup                 # Starts Docker PostgreSQL + applies schema + seeds DB
```

## Running the App

You need **two** processes running:

**Terminal 1 — Next.js dev server:**

```bash
npm run dev
```

Runs on http://localhost:3000. Logs appear in this terminal.

**Terminal 2 — Trigger.dev dev worker:**

```bash
npx trigger.dev@latest dev
```

Required for background jobs to execute locally. Task logs stream to this terminal. Without this, triggering a tool will queue the job but it won't execute.

## Database

- **Engine:** PostgreSQL 16 via Docker Compose (port 5432)
- **Start:** `docker compose up -d`
- **Apply schema changes:** `npm run db:push` (dev) or `npm run db:generate && npm run db:migrate` (migrations)
- **Seed data:** `npm run db:seed`
- **Production migrations:** `npm run db:migrate-prod`

## Viewing Logs & Debugging

### Trigger.dev Task Logs

- **Terminal:** The `npx trigger.dev@latest dev` terminal streams all task logs in real-time
- **Dashboard:** https://cloud.trigger.dev — shows run details, logs, metadata, and status for both dev and prod environments
- **MCP tools:** Use `list_runs` and `get_run_details` from the Trigger.dev MCP server to inspect runs programmatically
- **API:** `GET /api/runs/<runId>` returns status, output, and error for a given run

### Next.js Logs

- Standard terminal output from `npm run dev`

### Checking Run Status

```bash
# Via the API
curl -H "x-api-key: $AGENT_API_KEY" http://localhost:3000/api/runs/<runId>

# Via Trigger.dev MCP (if configured)
# Use list_runs or get_run_details tools
```

## Logging Conventions

- **Trigger tasks:** Use `logger` from `@trigger.dev/sdk` (not `console.log`). This integrates with Trigger.dev's log viewer and dashboard.
- **Progress tracking:** Use `metadata` from `@trigger.dev/sdk` to set progress, status, and current item — visible in the Trigger.dev dashboard and the portal's run-progress UI.
- **API routes / lib:** Standard `console.log` is fine (appears in Next.js terminal).

## Key Environment Variables

See `.env.example` for the full list. Critical ones:

- `STORAGE_DATABASE_URL` — Local PostgreSQL connection string
- `TRIGGER_SECRET_KEY` — Use a `tr_dev_...` key for local dev
- `ANTHROPIC_API_KEY` — Required for AI tasks
- `AGENT_API_KEY` — For programmatic API access (see `HOWTO.md`)

## Useful Commands

| Command                      | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `npm run dev`                | Start Next.js dev server                   |
| `npx trigger.dev@latest dev` | Start Trigger.dev local worker             |
| `npm run setup`              | Docker + DB schema + seed (first time)     |
| `npm run typecheck`          | TypeScript type checking                   |
| `npm run format`             | Prettier format all files                  |
| `npm run lint`               | ESLint check                               |
| `npm run deploy:prod`        | Migrate prod DB + deploy Trigger.dev tasks |
