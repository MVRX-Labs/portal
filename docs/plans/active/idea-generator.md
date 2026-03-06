# Idea Generator — Periodic Background Job

## Summary

A scheduled Trigger.dev task that runs hourly during UK working hours. It uses Claude to read the codebase, brainstorm product improvement ideas, pick the best one, implement it as a PR, append a one-liner to `IDEAS.md`, and notify Slack.

## Design Decisions

### Randomized prompting strategy

Each run randomly selects:

- **Scope**: small tweak vs. big feature (weighted coin flip)
- **Approach**: whether to generate 1 idea or 3-5 and pick the best
- **Web search**: whether to do web searches for inspiration (competitor analysis, UX patterns, industry trends) or work purely from the codebase

This randomness is done in code before the Claude prompt, so the prompt itself varies each run. This avoids the agent falling into repetitive patterns.

### Two-phase Claude execution

1. **Phase 1 — Ideation**: Claude reads the codebase, reads `IDEAS.md` to avoid repeats, optionally does web searches, and outputs a structured idea (title + description + implementation plan). Uses `claude-opus-4-6`.
2. **Phase 2 — Implementation**: A second Claude agent (using `claude-opus-4-6` like `implement-suggestion.ts`) implements the chosen idea in the cloned repo. This mirrors the existing implement-suggestion pattern.

### Slack notification

New `sendSlackIdeaNotification` function in `src/lib/slack.ts`. Separate from `sendSlackSuggestionNotification` because:

- Different emoji/title ("Idea Bot" vs "Suggestion PR")
- Includes the idea one-liner and category (small/big)
- Long-run we want different notification types to be independently tweakable

### IDEAS.md format

```
- 2026-03-06 09:00:00: Add bulk CSV import to LinkedIn audit tool
```

Timestamps rounded down to the nearest hour. File lives at repo root.

### Schedule

Hourly during UK working hours: `0 9-17 * * 1-5` (Mon-Fri, 9am-5pm London time).

### Cost logging

Log the `total_cost_usd` from both Claude phases at the end of the task via `logger.info`.

## File Changes

### New files

- `src/trigger/idea-generator.ts` — The scheduled task

### Modified files

- `src/lib/slack.ts` — Add `sendSlackIdeaNotification`

### Created on first run

- `IDEAS.md` (in the cloned repo, committed as part of the PR)

## Implementation Steps

1. Add `sendSlackIdeaNotification` to `src/lib/slack.ts`
2. Create `src/trigger/idea-generator.ts`:
   - Randomize scope/approach/webSearch booleans
   - Clone repo (same pattern as code-quality-scan and implement-suggestion)
   - Create branch `idea/{date}-{hour}`
   - Phase 1: Ideation agent (opus) — reads codebase + IDEAS.md, optionally web searches, outputs JSON with `{ title, description, plan }`
   - Phase 2: Implementation agent (opus) — implements the idea, edits code
   - Append one-liner to IDEAS.md
   - Commit, push, create PR
   - Send Slack notification
   - Log total cost from both phases
   - Cleanup temp dir in `finally` block

## Open Questions

None — ready to implement.
