---
name: Suggestion Box
overview: Add a "Suggest improvement" button to each tool page that lets a team member describe a code change scoped to that tool/job. On submit, a Trigger.dev task clones the repo, uses Claude Agent SDK (Opus) to implement the suggestion, creates a GitHub PR, and sends a Slack notification. Tracks progress via the existing toolRuns table — PR URL surfaces as outputUrl (same pattern as Google Docs links).
todos:
  - id: slack-notification
    content: Add `sendSlackSuggestionNotification()` to src/lib/slack.ts -- handles pr_created (with PR link) and failed (with error) types. Keep existing function untouched.
    status: pending
  - id: trigger-task
    content: Create src/trigger/implement-suggestion.ts -- Trigger.dev task that clones repo, creates branch, runs Claude Agent SDK query() with Opus and Bash/Read/Write/Edit/Glob/Grep tools, commits, pushes, creates PR via GitHub API, updates toolRuns with PR URL, sends Slack notification
    status: pending
  - id: api-route
    content: Create src/app/api/tools/suggestion/route.ts (POST). Follow existing tool route pattern -- insert toolRuns row, dispatch trigger task, return publicAccessToken.
    status: pending
  - id: ui-integration
    content: Modify src/components/tool-form.tsx -- add "Suggest improvement" button that opens a modal with description textarea. On submit, POST to /api/tools/suggestion with toolId context. Track as an activeRun with RunProgress. PR link shows via existing outputUrl pattern.
    status: pending
isProject: false
---

# Suggestion Box

## Key Design Decisions

1. **Per-job scoping**: The suggest button lives on each tool page (inside `ToolForm`). The suggestion is scoped to the specific tool — Claude gets context like "You are improving the LinkedIn Post Generator" and focuses on that tool's trigger task and related files.
2. **No new table**: Uses existing `toolRuns` with `tool: "suggestion"`. The `inputs` JSONB stores `{ toolId, description }`. PR URL goes in `outputUrl` — automatically renders as "View Output" link in history and recent runs (same as Google Docs).
3. **Opus model**: Claude agent uses Opus for maximum quality.

## Environment Variables Required

Add to `.env.local` and Trigger.dev environment:

```
GITHUB_TOKEN=ghp_...          # Personal access token with `repo` scope
GITHUB_REPO_OWNER=mvrxlabs    # GitHub org/user
GITHUB_REPO_NAME=mvrx         # Repository name
```

`SLACK_WEBHOOK_URL` already exists.

## Architecture

```
User on tool page (e.g. LinkedIn Post Generator) clicks "Suggest improvement"
  → Modal with description textarea (tool context is implicit)
  → POST /api/tools/suggestion { toolId: "linkedin-post-generator", description: "..." }
    → Insert toolRuns row (tool: "suggestion", inputs: { toolId, description }, status: "running")
    → tasks.trigger("implement-suggestion", payload)
    → Return { id, triggerRunId, publicAccessToken }
  → ActiveRun with RunProgress (real-time tracking, same as other tools)
  → On completion: outputUrl = PR URL, shows as "View Output" link

Trigger.dev task (implement-suggestion):
  1. Clone repo (shallow, HTTPS + GITHUB_TOKEN)
  2. Create branch: suggestion/{run_id}/{toolId}
  3. Claude Agent SDK query() with tools: Bash, Read, Write, Edit, Glob, Grep
     - Opus model, maxTurns: 50, bypassPermissions
     - Prompt: scoped to the specific tool — explore its trigger task, API route, UI, and related code
  4. git add -A && git commit (fail if no changes)
  5. git push origin branch
  6. GitHub REST API: POST /repos/{owner}/{repo}/pulls
  7. Update toolRuns (status: completed, outputUrl: PR URL), send Slack notification
```

## Step 1: Slack (`src/lib/slack.ts`)

Add new function (keep existing `sendSlackNotification` unchanged):

```typescript
export async function sendSlackSuggestionNotification(message: {
  type: "pr_created" | "failed";
  toolId: string;
  description: string;
  userName: string;
  prUrl?: string;
  branchName?: string;
  error?: string;
  runId: string;
}) {
  // Same webhook pattern as existing function
  // pr_created: "🔧 Suggestion PR created for {toolId} by {userName}" + PR link
  // failed: "❌ Suggestion failed for {toolId} by {userName}" + error
}
```

## Step 2: Trigger.dev Task (`src/trigger/implement-suggestion.ts`)

Key design decisions:

- `**retry.maxAttempts: 1**` — no retries (each attempt creates git state that would conflict)
- `**maxDuration: 3600**` — 1 hour max for complex suggestions
- **Shallow clone** (`--depth 50`) for speed
- `**GIT_TERMINAL_PROMPT=0` env var to prevent git from hanging
- **GitHub REST API** for PR creation (more portable than `gh` CLI in containers)
- **Opus model** for maximum quality
- **Empty diff detection** — fail gracefully if Claude makes no changes
- **Tool-scoped prompt** — Claude is told which tool the suggestion targets and focuses on related files

Helper: `exec()` wrapper around `execSync` with 2-min timeout per command.

Progress steps:

1. Cloning repository (5%)
2. Creating branch (10%)
3. Implementing suggestion with Claude (15%)
4. Committing changes (60%)
5. Pushing to GitHub (70%)
6. Creating pull request (80%)
7. Sending notifications (90% → 100%)

Claude prompt structure:

```
You are improving the "{toolName}" tool in this codebase.

The user has requested:
{description}

Key files for this tool:
- Trigger task: src/trigger/{taskFile}
- API route: src/app/api/tools/{toolId}/route.ts
- UI: src/components/tool-form.tsx (shared) and src/app/tools/{toolId}/page.tsx

Rules:
- Explore the codebase with Glob/Read first to understand patterns
- Use Write for new files, Edit for modifications
- Follow existing patterns and conventions
- NO git commands, NO npm/package install commands, NO config file changes
- Make changes complete (no TODOs or placeholders)
```

PR body includes: tool name, suggestion description, submitter name, Claude's summary (truncated to 2000 chars).

Error handling (matches existing task pattern):

- Update toolRuns status to `failed` with error message
- Send Slack failure notification
- Clean up temp directory
- Rethrow error

## Step 3: API Route (`src/app/api/tools/suggestion/route.ts`)

**POST** — follows existing tool route pattern (e.g. `linkedin-post-generator/route.ts`):

1. Auth via `x-user-id` header
2. Parse `{ toolId, description }` from body
3. Validate toolId exists in TOOLS array, description is non-empty
4. Insert toolRuns row: `{ tool: "suggestion", status: "running", inputs: { toolId, description }, userId }`
5. `tasks.trigger("implement-suggestion", { runId, toolId, description, userName })`
6. Store `triggerRunId` on the toolRuns row
7. `auth.createPublicToken({ scopes: { read: { runs: [handle.id] } }, expirationTime: "2h" })`
8. Return `{ id, status: "running", triggerRunId, publicAccessToken }`

## Step 4: UI Integration (`src/components/tool-form.tsx`)

Add to the existing `ToolForm` component:

**"Suggest improvement" button** — secondary style, placed below the submit button or in the card header area. Shows for all authenticated users.

**Modal** (inline state, no portal needed — matches existing component patterns):

- Backdrop overlay
- Card with description textarea (6 rows), pre-filled context: "Improvement for {tool.name}"
- Cancel + Submit buttons
- On submit: POST `/api/tools/suggestion` with `{ toolId: tool.id, description }`
- On success: add to `activeRuns` array — gets RunProgress tracking automatically
- On error: show error message

**No new components needed** — the existing `activeRuns` + `RunProgress` pattern handles real-time tracking. When complete, the run appears in "Recent runs" with `outputUrl` linking to the PR (rendered as "View Output" link, same as Google Docs).

## Files Summary

| File                                    | Action                                        |
| --------------------------------------- | --------------------------------------------- |
| `src/lib/slack.ts`                      | Modify — add suggestion notification function |
| `src/trigger/implement-suggestion.ts`   | Create — core Trigger.dev task                |
| `src/app/api/tools/suggestion/route.ts` | Create — POST handler                         |
| `src/components/tool-form.tsx`          | Modify — add suggest button + modal           |

## Testing

1. Set `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` env vars
2. Start dev server (`npm run dev`) and Trigger.dev dev worker (`npx trigger.dev@latest dev`)
3. Go to any tool page (e.g. LinkedIn Post Generator)
4. Click "Suggest improvement", enter: "Add better error messages when the contact has no LinkedIn URL"
5. Watch progress via RunProgress in the active runs area
6. Verify PR appears on GitHub with correct branch name and body
7. Verify PR URL shows as "View Output" link in recent runs
8. Verify Slack notification received with PR link
