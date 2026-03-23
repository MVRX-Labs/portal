# Plan: Notes Field + Secrets Management

**Status: IMPLEMENTED**

## Overview

Two features:

1. **Notes** — `notes` field on accounts and contacts (renamed from `summary` on accounts). UI disclaimer: not used by automation.
2. **Secrets** — `secretTypes` + `secrets` tables for storing account/contact credentials, with admin-only management page.

## What Was Built

### Notes

- `accounts.notes` (was `summary`) — migration renamed the column
- `contacts.notes` — new column
- `src/components/notes-field.tsx` — reusable NotesField component with "not used by automation" disclaimer
- API schemas updated in `src/lib/api-schemas/accounts.ts` and `src/lib/api-schemas/contacts.ts`

### Secrets

- `secretTypes` table — credential type registry (e.g. "Apollo API Key", "HeyReach Token")
- `secrets` table — stored credentials per account/contact, linked to a secret type
- `src/lib/api-schemas/secrets.ts` — Zod schemas
- API routes: `GET/POST /api/admin/secrets`, `GET/POST /api/admin/secret-types`, `PUT/DELETE /api/admin/secrets/[id]`
- `src/app/admin/secrets/page.tsx` — admin UI with account filter, table, add/edit modal
- `src/components/secret-modal.tsx` — add/edit modal component
- Sidebar updated with Secrets nav link
