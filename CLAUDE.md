# MVRX Portal

Internal portal for MVRX Labs — LinkedIn audits, AI content generation, calendar automation, and lead management.

## Tech Stack

Next.js (App Router), TypeScript, Drizzle ORM, Trigger.dev v3, Tailwind CSS

## Quick Reference

```
@HOWTO.md
@NOTES.md
@TRIGGER_DETAILS.md
docs/
├── @docs/architecture.md
├── @docs/design-decisions.md
├── @docs/local-dev.md
├── @docs/tech-debt.md
└── plans/
    ├── active/
    └── completed/
```

## Core Rules

- **Long-running operations** use Trigger.dev tasks (in `src/trigger/`). See @TRIGGER_DETAILS.md for SDK patterns.
- **ALWAYS send Slack notifications on Trigger.dev task failure** via `src/lib/slack.ts`.
- **Reduce coupling.** Each subsystem (calendar sync, LinkedIn audit, engagement scraping) can operate independently.
- **Do not expect accounts/contacts to always be accurate.** We should handle missing fields gracefully.
- **NEVER use `console.log` in Trigger tasks** — use `logger` from `@trigger.dev/sdk`. Enforced by `scripts/lint-architecture.sh`.
- **API routes use Zod schemas** defined in `src/lib/api-schemas/` for request/response validation.

## Dependency Rules (enforced by lint)

```
lib/  -->  trigger/  -->  app/api/  -->  app/pages + components/
```

- `trigger/` must NOT import from `app/`
- `lib/` must NOT import from `trigger/`
- `components/` must NOT import from `trigger/`

See `docs/architecture.md` for full details.

## Working on This Repo

- **Before architectural changes**, check @docs/design-decisions.md and @docs/architecture.md.
- **For complex work**, create a plan in `docs/plans/active/`. Move to `docs/plans/completed/` when done.
- **Every time you make a mistake or go down a wrong path**, write a note in `NOTES.md`.
