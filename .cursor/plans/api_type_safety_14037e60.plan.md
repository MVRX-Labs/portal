---
name: API type safety
overview: Add end-to-end type safety across all ~40 API routes and ~45 frontend fetch calls by introducing Zod schemas for request/response validation and shared TypeScript types that both the API and frontend consume.
todos:
  - id: install-zod
    content: Install Zod and create `src/lib/api-schemas/common.ts` with `parseBody` helper and error response schema
    status: completed
  - id: api-client
    content: Create `src/lib/api-client.ts` with typed `apiFetch` wrapper
    status: completed
  - id: account-schemas
    content: Create `src/lib/api-schemas/accounts.ts` -- schemas for account CRUD bodies and responses; migrate Account type from account-provider.tsx
    status: completed
  - id: contact-schemas
    content: Create `src/lib/api-schemas/contacts.ts` -- schemas for contact CRUD
    status: completed
  - id: engagement-schemas
    content: Create `src/lib/api-schemas/engagement.ts` -- config, profiles, posts, scrape schemas
    status: completed
  - id: analytics-schemas
    content: Create `src/lib/api-schemas/analytics.ts` -- config, profiles, scrape schemas; migrate types from analytics/types.ts
    status: completed
  - id: action-schemas
    content: Create `src/lib/api-schemas/actions.ts` -- action item CRUD schemas
    status: completed
  - id: admin-schemas
    content: Create `src/lib/api-schemas/admin.ts` -- user management + calendar schemas
    status: completed
  - id: tool-schemas
    content: Create `src/lib/api-schemas/tools.ts` -- shared tool trigger/response schema; update createToolHandler to accept Zod schema
    status: completed
  - id: remaining-schemas
    content: Create schemas for history, runs, resources, hooks routes
    status: completed
  - id: convert-routes
    content: Update all ~40 API route handlers to use parseBody + response types
    status: completed
  - id: convert-frontend
    content: Update all ~45 frontend fetch calls to use apiFetch with response schemas
    status: completed
  - id: migrate-existing-types
    content: Re-export Account, Contact, AnalyticsData, etc. from Zod schemas instead of manual interfaces
    status: completed
isProject: false
---

# API Type Safety

## Problem

The codebase has ~40 API route handlers and ~45 frontend `fetch()` calls with almost no type safety at the boundaries:

- **0 routes use Zod or any runtime validation library** -- request bodies are parsed via `request.json()` and destructured without validation
- **Response shapes are ad-hoc** -- each route returns `NextResponse.json({...})` with no shared type
- **Frontend calls are untyped** -- raw `fetch()` with `data.whatever` property access and no type assertions
- **No shared contract** -- types like `Account` and `Contact` exist in `[src/components/account-provider.tsx](src/components/account-provider.tsx)` and `[src/lib/types.ts](src/lib/types.ts)` but are never used to validate API inputs/outputs

## Approach: Zod schemas as the single source of truth

Introduce [Zod](https://zod.dev) as a validation + type generation library. Each API endpoint gets a schema for its input and output. The frontend and API both import the **inferred TypeScript types** from these schemas. This gives:

1. **Runtime validation** on the API side (bad requests get a 400 with a clear error)
2. **Compile-time type checking** on both sides
3. **A single source of truth** -- no duplicate type definitions

### Why Zod?

- Already the standard for Next.js/TypeScript projects; zero learning curve
- Schemas double as runtime validators AND TypeScript types (`z.infer<typeof schema>`)
- Excellent error messages out of the box
- Works well with the existing `createToolHandler` pattern

## File structure

Create a new `src/lib/api-schemas/` directory with one file per resource domain:

```
src/lib/api-schemas/
  accounts.ts       -- account CRUD, update, contacts sub-routes
  contacts.ts       -- contact CRUD
  actions.ts        -- action items
  engagement.ts     -- engagement config, profiles, posts, scrape, jobs
  analytics.ts      -- analytics config, profiles, scrape
  tools.ts          -- all tool-trigger routes (shared pattern)
  admin.ts          -- admin users, calendar
  resources.ts      -- Google Drive resources
  history.ts        -- run history
  runs.ts           -- individual run lookup
  common.ts         -- shared schemas (pagination, error responses, etc.)
```

Each file exports:

- Zod schemas (e.g., `updateAccountBodySchema`, `getAccountResponseSchema`)
- Inferred types (e.g., `type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>`)

## Changes by layer

### 1. API routes (input validation)

Each route handler that parses a request body will use a helper like:

```typescript
// src/lib/api-schemas/common.ts
import { z, ZodSchema } from "zod";
import { NextResponse } from "next/server";

export async function parseBody<T>(request: Request, schema: ZodSchema<T>) {
  const raw = await request.json().catch(() => null);
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null as never,
      error: NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 }),
    };
  }
  return { data: result.data, error: null };
}
```

Example transformation for `[src/app/api/accounts/[id]/engagement/config/route.ts](src/app/api/accounts/[id]/engagement/config/route.ts)`:

**Before:**

```typescript
const body = await request.json();
const { engagementSlackChannel } = body;
if (typeof engagementSlackChannel !== "string") { ... }
```

**After:**

```typescript
import { patchEngagementConfigBody } from "@/lib/api-schemas/engagement";
const { data, error } = await parseBody(request, patchEngagementConfigBody);
if (error) return error;
// data.engagementSlackChannel is typed as string
```

### 2. API routes (response types)

Return types are annotated by wrapping `NextResponse.json()` with the schema-derived type. This ensures the API returns what the frontend expects:

```typescript
// In the route handler
const response: GetAccountResponse = { account };
return NextResponse.json(response);
```

### 3. Frontend fetch calls

Create a thin typed fetch helper in `[src/lib/api-client.ts](src/lib/api-client.ts)`:

```typescript
import { ZodSchema } from "zod";

export async function apiFetch<T>(url: string, schema: ZodSchema<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return schema.parse(json);
}
```

Frontend calls become:

```typescript
const { account } = await apiFetch(`/api/accounts/${id}`, getAccountResponseSchema);
// account is fully typed
```

### 4. Existing types migration

Move entity types from `[src/components/account-provider.tsx](src/components/account-provider.tsx)` (`Account`, `Contact`) and `[src/app/analytics/types.ts](src/app/analytics/types.ts)` to be derived from Zod schemas in `src/lib/api-schemas/`. The component files re-export from schemas.

### 5. Tool handler pattern

The existing `[src/lib/tool-handler.ts](src/lib/tool-handler.ts)` already uses `Record<string, unknown>` for inputs. Extend `createToolHandler` to accept an optional Zod schema so each tool route can validate its specific inputs.

## Prioritized route list (by risk/usage)

**High priority** (most used, most fields, most likely to break silently):

- `POST /api/accounts` and `PUT /api/accounts/[id]` -- many untyped fields
- `POST /api/contacts` and `PUT /api/contacts/[id]` -- untyped body
- `PATCH /api/accounts/[id]/engagement/config` -- the example from the ticket
- `PATCH /api/accounts/[id]/analytics/config`
- `POST /api/accounts/[id]/engagement/profiles` -- untyped arrays
- `POST /api/accounts/[id]/analytics/profiles` -- typeof checks
- `POST /api/accounts/[id]/actions` and `PUT .../[actionId]`
- `POST /api/admin/users`, `PUT /api/admin/users`

**Medium priority** (tool routes -- all follow same pattern):

- All 7 tool routes under `/api/tools/`
- `POST /api/hooks/job-complete`

**Lower priority** (mostly GET routes, query params):

- GET routes with `searchParams` parsing
- `/api/history`, `/api/resources`, `/api/admin/calendar-events`

## Scope and rollout

This is a large change (~40 routes + ~45 frontend calls). Recommended rollout:

1. **Phase 1**: Install Zod, create `src/lib/api-schemas/common.ts` with `parseBody` helper and `apiFetch` client. Convert 3-4 high-priority routes end-to-end as proof of concept.
2. **Phase 2**: Convert all remaining POST/PUT/PATCH/DELETE routes (input validation).
3. **Phase 3**: Add response schemas and convert frontend calls to use `apiFetch`.
4. **Phase 4**: Convert GET routes with query param parsing.
