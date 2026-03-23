# Knowledge Hub

**Status: IMPLEMENTED**

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
                 ┘                                                      ▼
                                                              Account State
                                                                   │
                                                    ┌──────────────┼──────────────┐
                                                    ▼              ▼              ▼
                                              Account Brief   Open Items    Weekly Digest
                                              (always fresh)  (tracked)     (Slack DMs)
```

### Ingestion Pattern

Scheduled Trigger.dev task (`knowledge-slack-ingest-scheduled`):
- Runs every 30 minutes (Mon–Fri, 8am–10pm London)
- Fans out `knowledge-slack-ingest-channel` per active channel
- Polls `conversations.history` with `oldest` = last sync timestamp
- Stores raw events in `knowledge_events` table

### Multi-Channel Attribution

`knowledge_channels` table maps channel_id → account_id with category:
- `client_shared` — visible to client
- `client_internal` — MVRX-only, never surfaces in client outputs
- `general` / `product` / `ops` — internal categories

### Knowledge Unit Types

`action_item`, `decision`, `context_update`, `content_draft`, `request`, `feedback`, `deliverable`, `blocker`

### Account State (Living Documents)

Three documents per account, updated weekly by `knowledge-state-synthesis-schedule`:
- **Account Brief** (~500 tokens) — who, what, current focus
- **Open Items** (~1000 tokens) — action items, pending decisions, blockers
- **Activity Log** (rolling 14-day window) — what happened recently

## Database Tables

- `knowledge_channels` — channel-to-account mapping
- `knowledge_sync_state` — per-channel sync cursors
- `knowledge_events` — raw events from all sources
- `knowledge_units` — normalised knowledge items
- `knowledge_state` — per-account state documents
- `knowledge_digest_messages` — Slack DM digest tracking (done/undone per unit/recipient)

## Trigger Tasks

- `knowledge-slack-ingest-scheduled` / `knowledge-slack-ingest-channel` — polls Slack channels
- `knowledge-resolve-media` — fetches/transcribes Drive links and voice notes
- `knowledge-normalise-channel` / `knowledge-normalise-all` — LLM extraction into knowledge units
- `knowledge-state-synthesis-schedule` / `knowledge-state-synthesis-on-demand` — updates account state docs
- `knowledge-digest-schedule` / `knowledge-digest-on-demand` — weekly digest as Slack DMs

## Lib Modules

- `src/lib/knowledge/slack-client.ts` — Slack API wrapper (read-only)
- `src/lib/knowledge/normaliser.ts` / `normaliser-llm.ts` / `normaliser-loaders.ts` — LLM extraction logic
- `src/lib/knowledge/state-synthesis.ts` — account state management
- `src/lib/knowledge/digest.ts` — digest generation
- `src/lib/knowledge/drive-resolver.ts` — Google Drive link resolution
- `src/lib/knowledge/transcribe.ts` — voice note transcription
- `src/lib/knowledge/types.ts` — shared types
- `src/lib/knowledge/user-registry.ts` — Slack user → portal user mapping

## Portal UI

- `src/app/admin/knowledge/` — admin knowledge management pages
  - `state/` — per-account state document viewer
  - `units/` — knowledge unit browser

## Security

- Internal channel content tagged `visibility: 'internal'` at the event level
- Internal knowledge units never included in client-facing outputs
- Digest outputs go to Tarun + Nitanshu only (not client channels)
- Bot token scoped to read-only Slack operations

See `docs/design-decisions.md` → "Knowledge Hub: Three-Layer Event Architecture"
