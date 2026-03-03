---
name: Suggestion Box
overview: Add a floating "Suggest" button to the UI that lets any team member describe a codebase change. On submit, a Trigger.dev job clones the repo, uses Claude Agent SDK to implement the suggestion, creates a GitHub PR, and sends a Slack notification for review.
todos:
  - id: ids-prefix
    content: Add `suggestion` prefix to src/lib/ids.ts -- add to PREFIXES, create SuggestionId type, wire into PrefixToId, ObjectId, prefixForTable
    status: pending
  - id: db-schema
    content: Add `suggestions` table to src/lib/schema.ts -- id (suggestion_*), title, description, status (pending/cloning/implementing/pushing/creating_pr/completed/failed), prUrl, branchName, error, userId (FK users), triggerRunId, createdAt, updatedAt
    status: pending
  - id: db-migration
    content: Run `npx drizzle-kit generate` then `npx drizzle-kit push` to create and apply the migration
    status: pending
  - id: slack-notification
    content: Add `sendSlackSuggestionNotification()` to src/lib/slack.ts -- handles pr_created (with PR link) and failed (with error) types. Keep existing function untouched.
    status: pending
  - id: trigger-task
    content: Create src/trigger/implement-suggestion.ts -- Trigger.dev task that clones repo, creates branch, runs Claude Agent SDK query() with Bash/Read/Write/Edit/Glob/Grep tools, commits, pushes, creates PR via GitHub API, sends Slack notification
    status: pending
  - id: api-routes
    content: Create src/app/api/suggestions/route.ts (POST create + GET list) and src/app/api/suggestions/[id]/route.ts (GET detail with token refresh). Follow pattern from tools/system-test route.
    status: pending
  - id: ui-component
    content: Create src/components/suggestion-button.tsx -- floating button (fixed bottom-right), modal with title+description form, status toast with RunProgress for real-time tracking
    status: pending
  - id: layout-integration
    content: Add <SuggestionButton /> to src/app/layout.tsx inside the AccountProvider block
    status: pending
isProject: false
---

# Suggestion Box

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
User clicks "Suggest" → Modal (title + description)
  → POST /api/suggestions
    → Insert suggestions row (status: pending)
    → tasks.trigger("implement-suggestion", payload)
    → Return { id, triggerRunId, publicAccessToken }
  → Status toast with RunProgress (real-time via Trigger.dev hooks)

Trigger.dev task (implement-suggestion):
  1. Clone repo (shallow, HTTPS + GITHUB_TOKEN)
  2. Create branch: suggestion/{suggestion_id}
  3. Claude Agent SDK query() with tools: Bash, Read, Write, Edit, Glob, Grep
     - Sonnet model, maxTurns: 50, bypassPermissions
     - Prompt: explore codebase, implement suggestion, no git/npm commands
  4. git add -A && git commit (fail if no changes)
  5. git push origin branch
  6. GitHub REST API: POST /repos/{owner}/{repo}/pulls
  7. Update DB (status: completed, prUrl), send Slack notification
```

## Step 1: IDs (`src/lib/ids.ts`)

Add to PREFIXES:

```typescript
suggestion: "suggestion",
```

Add type:

```typescript
export type SuggestionId = `suggestion_${string}`;
```

Wire into `PrefixToId`, `ObjectId` union, and `prefixForTable` map (`suggestions: "suggestion"`).

## Step 2: Schema (`src/lib/schema.ts`)

```typescript
export const suggestions = pgTable("suggestions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("suggestion")),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  prUrl: text("pr_url"),
  branchName: text("branch_name"),
  error: text("error"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  triggerRunId: text("trigger_run_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

## Step 3: Migration

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

## Step 4: Slack (`src/lib/slack.ts`)

Add new function (keep existing `sendSlackNotification` unchanged):

```typescript
export async function sendSlackSuggestionNotification(message: {
  type: "pr_created" | "failed";
  title: string;
  userName: string;
  prUrl?: string;
  branchName?: string;
  error?: string;
  suggestionId: string;
}) {
  // Same webhook pattern as existing function
  // pr_created: shows PR link, branch name, submitter
  // failed: shows error, submitter
}
```

## Step 5: Trigger.dev Task (`src/trigger/implement-suggestion.ts`)

Key design decisions:

- `**retry.maxAttempts: 1**` -- no retries (each attempt creates git state that would conflict)
- `**maxDuration: 3600**` -- 1 hour max for complex suggestions
- **Shallow clone** (`--depth 50`) for speed
- `**GIT_TERMINAL_PROMPT=0`\*\* env var to prevent git from hanging
- **GitHub REST API** for PR creation (more portable than `gh` CLI in containers)
- **Sonnet model** for speed+quality balance
- **Empty diff detection** -- fail gracefully if Claude makes no changes

Helper: `exec()` wrapper around `execSync` with 2-min timeout per command.

Progress steps:

1. Cloning repository (5%)
2. Creating branch (10%)
3. Implementing suggestion with Claude (15%)
4. Committing changes (60%)
5. Pushing to GitHub (70%)
6. Creating pull request (80%)
7. Sending notifications (90% → 100%)

Claude prompt rules:

- Explore codebase with Glob/Read first
- Use Write for new files, Edit for modifications
- Follow existing patterns
- NO git commands, NO npm commands, NO config file changes
- Make changes complete (no TODOs/placeholders)

PR body includes: suggestion title, description, submitter, Claude's summary (truncated to 2000 chars).

Error handling (matches existing pattern):

- Update DB status to `failed` with error message
- Send Slack failure notification
- Clean up temp directory
- Rethrow error

## Step 6: API Routes

### `src/app/api/suggestions/route.ts`

**POST** -- follows `src/app/api/tools/system-test/route.ts` pattern:

1. Auth via `x-user-id` header
2. Validate title + description
3. Insert suggestions row
4. `tasks.trigger("implement-suggestion", payload)`
5. `auth.createPublicToken({ scopes: { read: { runs: [handle.id] } }, expirationTime: "2h" })`
6. Return `{ id, status, triggerRunId, publicAccessToken }`

**GET** -- list user's suggestions, ordered by `createdAt desc`, limit 20.

### `src/app/api/suggestions/[id]/route.ts`

**GET** -- return suggestion detail. If still active, refresh public access token.

## Step 7: UI Component (`src/components/suggestion-button.tsx`)

Single `"use client"` component with three parts:

**Floating button** -- `position: fixed`, bottom-right (bottom-6 right-6, z-40), "Suggest" label, accent background. Only renders if `useSession()` returns a user.

**Modal** (via `createPortal`):

- Backdrop (black/60, click to close)
- Card with title input + description textarea (6 rows)
- Cancel (btn-secondary) + Submit (btn-primary) buttons
- Error display
- On submit: POST /api/suggestions, set activeSuggestion state, close modal, show toast

**Status toast** (via `createPortal`):

- Fixed position above the floating button (bottom-16 right-6)
- Shows suggestion ID, `<RunProgress>` component for real-time tracking
- On complete: fetch `/api/suggestions/{id}` to get final status
- Success state: green badge + "View Pull Request" link
- Failed state: red badge + error message
- "Hide" button to dismiss

## Step 8: Layout (`src/app/layout.tsx`)

Add import and render `<SuggestionButton />` after the flex container, inside `<AccountProvider>`:

```tsx
<AccountProvider>
  <div className="flex min-h-screen">
    <Sidebar />
    <main className="flex-1 p-6 overflow-auto">
      <AccountWarningBanner />
      {children}
    </main>
  </div>
  <SuggestionButton />
</AccountProvider>
```

## Files Summary

| File                                    | Action                                         |
| --------------------------------------- | ---------------------------------------------- |
| `src/lib/ids.ts`                        | Modify -- add suggestion prefix                |
| `src/lib/schema.ts`                     | Modify -- add suggestions table                |
| `src/lib/slack.ts`                      | Modify -- add suggestion notification function |
| `src/trigger/implement-suggestion.ts`   | Create -- core Trigger.dev task                |
| `src/app/api/suggestions/route.ts`      | Create -- POST + GET                           |
| `src/app/api/suggestions/[id]/route.ts` | Create -- GET detail                           |
| `src/components/suggestion-button.tsx`  | Create -- floating button + modal + toast      |
| `src/app/layout.tsx`                    | Modify -- add SuggestionButton                 |

## Testing

1. Set `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` env vars
2. Start dev server (`npm run dev`) and Trigger.dev dev worker (`npx trigger.dev@latest dev`)
3. Click "Suggest" button, submit: title="Add file header comment", description="Add a comment to the top of src/lib/ids.ts explaining what the file does"
4. Watch progress in status toast
5. Verify PR appears on GitHub with correct branch name and body
6. Verify Slack notification received with PR link
