# Skill Ingestion: Auto-implement third-party Claude Skills as native portal tools

## Context

There's a growing ecosystem of Claude Skills (SKILL.md files on skills.sh, GitHub, etc.) that automate GTM activities. MVRX Labs wants to be able to take any promising skill and quickly turn it into a native portal tool - a first-class Trigger.dev task with API route and UI.

Rather than building a generic skill runner, the approach is: **an MVRX user provides a skill URL or SKILL.md content, a background job uses Claude Agent SDK to implement the skill as a proper Trigger.dev task (following existing patterns), and creates a PR for developer review.** This is the same pattern as the existing idea bot and implement-suggestion task.

The generated Trigger.dev task will itself invoke Claude Agent SDK at runtime (since most skills need AI to do their work).

---

## What gets built

### 1. Extract shared `runClaudeAgent()` helper

The `runClaudeAgent()` function (currently in `idea-generator.ts:34-79`) is duplicated in `implement-suggestion.ts:107-139`. Extract it to a shared location so both existing tasks and all future generated skill tasks can use it.

**File:** `src/lib/claude-agent.ts` (new)

- Move `runClaudeAgent()` here from `idea-generator.ts`
- Same signature: `(prompt, cwd, { allowedTools, maxTurns }) => { output, costUsd, durationMs, turns }`
- Update `idea-generator.ts` and `implement-suggestion.ts` to import from here

### 2. Skill ingestion Trigger.dev task

**File:** `src/trigger/ingest-skill.ts` (new)

A task that follows the `implement-suggestion.ts` pattern exactly:

1. Clone repo into temp dir, create branch `skill/<slug>`
2. If a URL was provided, fetch the SKILL.md content first
3. Run Claude Agent SDK in two phases:
   - **Phase 1 (Analysis)**: Read-only. Claude reads the SKILL.md, explores the codebase patterns, and outputs a JSON plan: what the skill does, what inputs it needs, what tools the runtime agent needs, and an implementation plan
   - **Phase 2 (Implementation)**: Claude implements the skill as a native tool following existing patterns, creating:
     - A Trigger.dev task in `src/trigger/skills/<slug>.ts` that uses `runClaudeAgent()` at runtime
     - A Zod schema in `src/lib/api-schemas/skills/<slug>.ts`
     - An API route in `src/app/api/tools/<slug>/route.ts`
     - A `ToolConfig` entry added to `TOOLS` in `src/lib/types.ts`
4. Commit, push, create PR with skill analysis + implementation summary
5. Slack notification with PR link

**The implementation prompt** will include:

- The full SKILL.md content for Claude to understand the skill's purpose
- Key reference files to read: `src/lib/types.ts` (ToolConfig pattern), `src/lib/tool-handler.ts` (createToolHandler), an existing task like `src/trigger/linkedin-post-generator.ts` (runtime pattern), `src/lib/claude-agent.ts` (shared helper)
- Explicit instruction that the generated task must call `runClaudeAgent()` with the skill's instructions as the prompt, using appropriate `allowedTools`
- Security rules: never embed API keys, never give Bash to untrusted skill instructions, use WebFetch/WebSearch only when the skill genuinely needs web access
- The existing CLAUDE.md rules (300 line limit, logger not console.log, etc.)

### 3. Prompt files for the ingestion task

**File:** `src/trigger/ingest-skill-prompts.ts` (new)

Similar to `idea-generator-prompts.ts`, contains:

- `buildAnalysisPrompt(skillMd: string)` - prompt for phase 1 (analyze skill, plan implementation)
- `buildImplementationPrompt(skillMd: string, analysis: SkillAnalysis)` - prompt for phase 2
- `parseAnalysisFromOutput(output: string)` - extract JSON analysis from Claude's output
- Security preamble text explaining what the generated task must NOT do

### 4. API route to trigger ingestion

**File:** `src/app/api/tools/ingest-skill/route.ts` (new)

Follows the standard tool route pattern using `createToolHandler` or the manual pattern from `implement-suggestion`:

- Accepts `{ skillUrl?: string, skillMd?: string, slug?: string, notes?: string }`
- If `skillUrl` provided, validates it's a plausible URL (skills.sh, GitHub, etc.)
- Creates `toolRuns` record with `tool = "ingest-skill"`
- Dispatches the `ingest-skill` Trigger.dev task
- Returns `{ id, status, triggerRunId, publicAccessToken }`

### 5. Zod schema

**File:** `src/lib/api-schemas/skills.ts` (new)

```typescript
export const ingestSkillBodySchema = z
  .object({
    skillUrl: z.string().url().optional(),
    skillMd: z.string().optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    notes: z.string().optional(), // additional context for Claude
  })
  .refine((data) => data.skillUrl || data.skillMd, {
    message: "Either skillUrl or skillMd is required",
  });
```

### 6. UI page for skill ingestion

**File:** `src/app/tools/ingest-skill/page.tsx` (new)

Simple form with:

- Text input for skill URL (e.g., `https://skills.sh/seo-skills/seo-audit-skill/seo-audit`)
- Textarea for pasting SKILL.md content directly (alternative to URL)
- Text input for desired slug (optional, Claude will pick one if omitted)
- Textarea for notes/guidance (optional, e.g., "focus on the SEO audit part, skip the crawling")
- Standard "Run Tool" button + RunProgress component for tracking

### 7. Add to TOOLS array

Add an entry in `src/lib/types.ts`:

```typescript
{
  id: "ingest-skill",
  name: "Ingest Skill",
  description: "Import a third-party Claude Skill and auto-implement it as a native portal tool. Creates a PR for review.",
  href: "/tools/ingest-skill",
  fields: [
    { name: "skillUrl", label: "Skill URL", type: "text", placeholder: "https://skills.sh/..." },
    { name: "skillMd", label: "Or paste SKILL.md content", type: "textarea" },
    { name: "slug", label: "Tool slug (optional)", type: "text", placeholder: "seo-audit" },
    { name: "notes", label: "Notes for implementation (optional)", type: "textarea" },
  ],
}
```

---

## How the generated skill tasks work at runtime

Claude decides during the analysis phase what kind of runtime task to generate. Not every skill needs AI at runtime.

**AI-powered tasks** (most skills) - generated task in `src/trigger/skills/<slug>.ts`:

```
1. Receive payload (inputs from the user via the API route)
2. Create temp dir, write any input data as files
3. Build a prompt from the skill's instructions + user's inputs
4. Call runClaudeAgent() with appropriate allowedTools
5. Capture output, update toolRuns, send Slack notification
```

**Non-AI tasks** (skills that are mostly API calls, scraping, or data processing):

```
1. Receive payload
2. Execute the core logic directly (API calls, data transforms, etc.)
3. Update toolRuns, send Slack notification
```

The analysis phase outputs which pattern to use and, for AI tasks, what `allowedTools` the runtime agent needs:

- Research/analysis skills: `["WebFetch", "WebSearch"]`
- Content generation skills: `["WebFetch", "WebSearch"]` (output is always text)
- Skills needing file generation: `["Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"]`
- Bash is only included if the skill genuinely needs it AND the PR reviewer approves

---

## Security model

- **Human PR review is the primary security gate.** Every ingested skill produces a PR that must be reviewed before merge.
- The ingestion prompt instructs Claude to never embed secrets, never use `Bash` in the generated task unless absolutely necessary, and to prefer minimal tool allowlists.
- At PR review time, the developer checks:
  - What tools the generated task gives to the runtime agent
  - Whether the skill's instructions contain anything suspicious
  - Whether the generated code follows existing patterns
- Skills that need Bash or broad tool access get extra scrutiny.

---

## Files to create/modify

| Action | File                                      | Notes                                                             |
| ------ | ----------------------------------------- | ----------------------------------------------------------------- |
| Create | `src/lib/claude-agent.ts`                 | Extract shared `runClaudeAgent()`                                 |
| Create | `src/trigger/ingest-skill.ts`             | Main ingestion task (follows implement-suggestion pattern)        |
| Create | `src/trigger/ingest-skill-prompts.ts`     | Prompt builders for analysis + implementation phases              |
| Create | `src/lib/api-schemas/skills.ts`           | Zod schema for ingestion request                                  |
| Create | `src/app/api/tools/ingest-skill/route.ts` | API route                                                         |
| Create | `src/app/tools/ingest-skill/page.tsx`     | UI page                                                           |
| Modify | `src/lib/types.ts`                        | Add ingest-skill to TOOLS array                                   |
| Modify | `src/trigger/idea-generator.ts`           | Import `runClaudeAgent` from shared module                        |
| Modify | `src/trigger/implement-suggestion.ts`     | Import `runClaudeAgent` from shared module, remove inline version |

---

## Key existing code to reuse

| What                                            | File                                         | How                                                               |
| ----------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `runClaudeAgent()` pattern                      | `src/trigger/idea-generator.ts:34-79`        | Extract to shared, reuse everywhere                               |
| Clone/branch/commit/push/PR lifecycle           | `src/trigger/implement-suggestion.ts:77-248` | Same flow for ingestion task                                      |
| Two-phase Claude (analysis then implementation) | `src/trigger/idea-generator.ts:132-163`      | Same pattern: read-only analysis, then implementation             |
| `createToolHandler` factory                     | `src/lib/tool-handler.ts`                    | For the ingest-skill API route                                    |
| `ToolConfig` + `TOOLS` array                    | `src/lib/types.ts:5-230`                     | Add ingest-skill entry, and generated skills add entries here too |
| `parseBody` + Zod validation                    | `src/lib/api-schemas/common.ts`              | For request validation                                            |
| `sendSlackNotification`                         | `src/lib/slack.ts`                           | For failure/success notifications                                 |
| Trigger.dev metadata progress                   | All trigger tasks                            | Same `metadata.set("progress", ...)` pattern                      |

---

## Verification

1. **Unit test**: Create a mock SKILL.md (e.g., the SEO audit skill's instructions trimmed down) and verify the prompt builder produces a sensible prompt
2. **Integration test**: Run the ingestion task locally against a test skill URL, verify it creates a branch with the expected files
3. **End-to-end test**:
   - Go to `/tools/ingest-skill` in the portal
   - Paste a SKILL.md or provide a URL
   - Watch progress via RunProgress component
   - Verify a PR is created on GitHub with the correct files
   - Review the PR: check the generated task uses `runClaudeAgent()`, has appropriate `allowedTools`, follows existing patterns
   - Merge the PR and verify the new tool appears in the portal
4. **Security spot-check**: Ingest a skill with suspicious content (prompt injection, env var references) and verify the generated code doesn't propagate the injection
