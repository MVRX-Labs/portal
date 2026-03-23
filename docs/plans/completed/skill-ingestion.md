# Skill Ingestion: Auto-implement third-party Claude Skills as native portal tools

**Status: IMPLEMENTED**

## What Was Built

A system for ingesting third-party SKILL.md files and implementing them as native portal tools via automated PRs.

### Key files

- `src/lib/claude-agent.ts` — shared `runClaudeAgent()` helper (extracted from idea-generator and implement-suggestion)
- `src/trigger/ingest-skill.ts` — task ID `ingest-skill`; two-phase Claude implementation (analysis then code generation)
- `src/trigger/ingest-skill-prompts.ts` — prompt builders for analysis and implementation phases
- `src/lib/api-schemas/skills.ts` — Zod schema for ingestion request
- `src/app/api/tools/ingest-skill/route.ts` — API route
- `src/app/tools/ingest-skill/page.tsx` — UI page

### How it works

1. User provides a skill URL or pastes SKILL.md content
2. Phase 1 (read-only): Claude reads the SKILL.md, explores codebase patterns, outputs a JSON implementation plan
3. Phase 2 (implementation): Claude writes a Trigger.dev task, Zod schema, API route, and ToolConfig entry; commits and opens a PR
4. Slack notification with PR link

### Security model

Human PR review is the primary security gate. The ingestion prompt instructs Claude to never embed secrets, prefer minimal tool allowlists, and avoid `Bash` unless essential.

### Design decision

See `docs/design-decisions.md` → "Skill Ingestion: Shared `runClaudeAgent()` Helper"
