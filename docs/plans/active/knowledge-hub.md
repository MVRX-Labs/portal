# Knowledge Hub

Centralised knowledge management for MVRX Labs client accounts. Ingests Slack channels, meeting notes, and Drive documents — normalises via LLM — maintains per-account living state documents — produces weekly digests and action items.

## Architecture

### Three-Layer Design

```
Layer 1: Events (raw)     → Append-only log of every input
Layer 2: Knowledge Units  → LLM-extracted, typed, atomic items
Layer 3: Account State    → Rolling summaries, open items, activity log
```

### Data Flow

```
Slack channels ──┐
Meeting notes  ──┼──→ Raw Events (DB) ──→ Normalisation Agent ──→ Knowledge Units
Drive docs     ──┤        (scheduled)         (Trigger task)           │
CRM telemetry ──┘                                                      ▼
                                                              Account State
                                                                   │
                                                    ┌──────────────┼──────────────┐
                                                    ▼              ▼              ▼
                                              Account Brief   Open Items    Weekly Digest
                                              (always fresh)  (tracked)     (Slack post)
```

### Ingestion Pattern

Scheduled Trigger.dev task (like `calendar-sync`):
- Runs every 30 minutes during working hours
- Polls `conversations.history` with `oldest` = last sync timestamp
- Fetches thread replies for threaded messages
- Stores raw events in `knowledge_events` table
- Triggers normalisation when batch completes

Future enhancement: Slack Events API webhook at `/api/hooks/slack-knowledge` for real-time.

### Multi-Channel Attribution

```
knowledge_channels table maps channel_id → account_id
  - type: 'shared' (client-facing) | 'internal' (MVRX only)
  - internal channels are NEVER exposed to front-end outputs
```

One account can have multiple channels. All channels feed into the same account's knowledge store.

### Normalisation Agent

Runs after ingestion (or on schedule). Per account:
1. Groups unprocessed events by time window
2. Resolves media: Whisper for voice notes, Drive API for doc links
3. Extracts structured knowledge units via Claude Haiku
4. Updates account state documents

Knowledge unit types: `action_item`, `decision`, `context_update`, `content_draft`, `request`, `feedback`, `deliverable`, `blocker`

### Account State (Living Documents)

Three documents per account, updated incrementally:
- **Account Brief** (~500 tokens) — who, what, current focus
- **Open Items** (~1000 tokens) — action items, pending decisions, blockers
- **Activity Log** (rolling 14-day window) — what happened recently

These are what the digest agent reads — not raw messages.

## Database Tables

New tables (all following existing ID prefix conventions):
- `knowledge_channels` — channel-to-account mapping
- `knowledge_sync_state` — per-channel sync cursors
- `knowledge_events` — raw events from all sources
- `knowledge_units` — normalised knowledge items
- `knowledge_state` — per-account state documents

## Trigger Tasks

- `knowledge-slack-ingest` — scheduled, polls Slack channels
- `knowledge-normalise` — processes raw events into units
- `knowledge-digest` — weekly summary generation + Slack post

## Lib Modules

- `src/lib/knowledge/slack-client.ts` — Slack API wrapper (read-only)
- `src/lib/knowledge/normaliser.ts` — LLM extraction logic
- `src/lib/knowledge/state.ts` — Account state management
- `src/lib/knowledge/types.ts` — Shared types

## Security

- Internal channel content is tagged `visibility: 'internal'`
- Internal knowledge units are NEVER included in client-facing outputs
- All outputs go to Tarun + Nitanshu only (not client channels)
- Bot token scoped to read-only operations on Slack (no write actions in ingestion)

## Status

- [x] Plan
- [ ] Schema + migration
- [ ] Slack ingestion task
- [ ] Normalisation task
- [ ] Digest task
- [ ] API endpoints for portal UI
