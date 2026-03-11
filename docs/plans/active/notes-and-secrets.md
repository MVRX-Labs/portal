# Plan: Notes Field + Secrets Management

## Overview

Two features:

1. **Notes** — rename `summary` → `notes` on accounts (DB column rename via migration); add `notes` field to contacts. UI disclaimer: not used by automation.
2. **Secrets** — new `secretTypes` + `secrets` tables for storing account/contact credentials, with admin-only management page.

---

## Part 1: Notes Field

### 1A. Schema changes (`src/lib/schema.ts`)

- Rename `summary` → `notes` on accounts table (keep DB column as `notes`, update Drizzle field name)
- Add `notes: text("notes")` to contacts table

### 1B. Migration

- SQL migration: `ALTER TABLE accounts RENAME COLUMN summary TO notes;`
- SQL migration: `ALTER TABLE contacts ADD COLUMN notes text;`

### 1C. API schema changes

- `src/lib/api-schemas/accounts.ts`: Rename `summary` → `notes` in `accountSchema`, `updateAccountBodySchema`
- `src/lib/api-schemas/contacts.ts`: Add `notes: z.string().nullable()` to `contactSchema`, `notes: z.string().nullable().optional()` to `updateContactBodySchema` and `createContactBodySchema`

### 1D. API route changes

- `src/app/api/accounts/route.ts` GET: Rename `summary` → `notes` in select
- `src/app/api/accounts/[id]/route.ts` PUT: Rename `summary` → `notes` in update handler
- `src/app/api/contacts/[id]/route.ts` PUT: Include `notes` in update set

### 1E. UI — Notes component (`src/components/notes-field.tsx`)

Reusable `NotesField` component:

- Props: `value: string | null`, `onChange: (value: string) => void`
- Textarea with disclaimer: "For internal reference only — not used by any automated processes."

### 1F. UI — Accounts page (`src/app/accounts/page.tsx`)

- Rename all `summary` state/references → `notes`
- Replace inline textarea with `NotesField` component for accounts
- Add `NotesField` for contacts in expanded edit section
- Wire up to save flow (include `notes` in PUT body)

---

## Part 2: Secrets

### 2A. New ID prefixes (`src/lib/ids.ts`)

- Add `sectype: "sectype"` and `secret: "secret"` prefixes
- Add types: `SecretTypeId`, `SecretId`
- Update `ObjectId`, `PrefixToId`, `prefixForTable`

### 2B. Schema — new tables (`src/lib/schema.ts`)

**`secretTypes` table:**

- `id` (text PK, `sectype_*`)
- `name` (text, not null, unique)
- `createdAt` (timestamp)

**`secrets` table:**

- `id` (text PK, `secret_*`)
- `accountId` (text, not null, FK → accounts)
- `contactId` (text, nullable, FK → contacts)
- `typeId` (text, not null, FK → secretTypes)
- `name` (text, not null)
- `value` (text, not null) — plaintext for now
- `description` (text, nullable)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### 2C. Migration

- Generate migration for both new tables

### 2D. API schemas (`src/lib/api-schemas/secrets.ts` — new file)

### 2E. API routes (all admin-only, protected by middleware)

- `/api/admin/secret-types/route.ts` — GET, POST
- `/api/admin/secrets/route.ts` — GET (?accountId= filter), POST
- `/api/admin/secrets/[id]/route.ts` — PUT, DELETE

### 2F. Admin UI page (`src/app/admin/secrets/page.tsx`)

- Account filter dropdown
- Table: Account, Contact, Type, Name, Value (masked/reveal), Description
- Add/Edit modal with type dropdown + "Create new type..." option
- Delete with confirmation

### 2G. Sidebar (`src/components/sidebar.tsx`)

- Add "Secrets" link in admin section

---

## File summary

| File                                      | Change                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/ids.ts`                          | Add `sectype`, `secret` prefixes + types                                                              |
| `src/lib/schema.ts`                       | Rename `summary` → `notes` on accounts; add `notes` to contacts; add `secretTypes` + `secrets` tables |
| `src/lib/api-schemas/accounts.ts`         | Rename `summary` → `notes`                                                                            |
| `src/lib/api-schemas/contacts.ts`         | Add `notes`                                                                                           |
| `src/lib/api-schemas/secrets.ts`          | **New**                                                                                               |
| `src/app/api/accounts/route.ts`           | Rename summary → notes                                                                                |
| `src/app/api/accounts/[id]/route.ts`      | Rename summary → notes                                                                                |
| `src/app/api/contacts/[id]/route.ts`      | Handle `notes` in PUT                                                                                 |
| `src/app/api/admin/secret-types/route.ts` | **New**                                                                                               |
| `src/app/api/admin/secrets/route.ts`      | **New**                                                                                               |
| `src/app/api/admin/secrets/[id]/route.ts` | **New**                                                                                               |
| `src/components/notes-field.tsx`          | **New**                                                                                               |
| `src/app/accounts/page.tsx`               | Rename summary → notes, add NotesField for contacts                                                   |
| `src/app/admin/secrets/page.tsx`          | **New**                                                                                               |
| `src/components/sidebar.tsx`              | Add Secrets nav link                                                                                  |
| `drizzle/`                                | New migration file(s)                                                                                 |

## Order of implementation

1. Schema + IDs + migration
2. API schemas
3. API routes — notes
4. API routes — secrets
5. UI — NotesField component
6. UI — accounts page wiring
7. UI — admin secrets page
8. Sidebar update
