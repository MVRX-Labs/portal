---
name: Accounts and Contacts Architecture
overview: Introduce accounts (organisations) and contacts (people within organisations) as core data models, with account selection in the sidebar, contact pickers replacing person-related input fields, per-account Google Drive folders, and account-scoped history/resources.
todos:
  - id: schema
    content: Add accounts and contacts tables to schema.ts, add accountId to toolRuns, generate Drizzle migration
    status: pending
  - id: account-api
    content: Create account CRUD API routes (GET/POST /api/accounts, GET/PUT /api/accounts/[id])
    status: pending
  - id: contact-api
    content: Create contact CRUD API routes (GET/POST /api/contacts, PUT /api/contacts/[id], GET /api/accounts/[id]/contacts)
    status: pending
  - id: gdrive-upgrade
    content: "Upgrade gdrive.ts: change scope to drive (read+write), add createFolder function"
    status: pending
  - id: account-selector
    content: Build AccountSelector component (searchable dropdown in sidebar with create-account flow)
    status: pending
  - id: account-provider
    content: Build AccountProvider context + useAccount hook, wire into layout.tsx
    status: pending
  - id: no-account-warning
    content: Add warning banner when no account is selected
    status: pending
  - id: contact-picker
    content: Build ContactPicker component (searchable dropdown with inline create via modal)
    status: pending
  - id: create-contact-modal
    content: Build CreateContactModal component
    status: pending
  - id: update-tool-types
    content: "Update types.ts: remove companyName fields, add contact field type to LinkedIn Audit"
    status: pending
  - id: update-tool-form
    content: Update tool-form.tsx to handle contact field type and pass accountId
    status: pending
  - id: update-tool-routes
    content: Update tool API routes to resolve account/contact data and store accountId on runs
    status: pending
  - id: update-history
    content: Update history page and API to support account filtering
    status: pending
  - id: update-resources
    content: Update resources page and API to use per-account Google Drive folder
    status: pending
isProject: false
---

# Accounts and Contacts Architecture

## Assumptions (since clarifying questions were skipped)

- **URL structure**: Active account stored as a query parameter (`?account=<id>`) on all pages. Simplest approach with no routing changes.
- **Account-level data**: Store `name`, `industry`, `website`, and `googleDriveFolderId` on the account. Fields like `targetAudience`, `productDescription`, `productName` remain per-run inputs (they vary too much per engagement to lock to an account).
- **Tool runs**: Add an `accountId` foreign key to `toolRuns` so history can be filtered by account.

---

## Phase 1: Database Schema

Add three new tables to [src/lib/schema.ts](src/lib/schema.ts) and generate a Drizzle migration:

`**accounts` table:

- `id` (text, PK, cuid2)
- `name` (text, not null) -- organisation name
- `industry` (text, nullable)
- `website` (text, nullable)
- `googleDriveFolderId` (text, nullable) -- created on account setup
- `createdAt`, `updatedAt` (timestamps)

`**contacts` table:

- `id` (text, PK, cuid2)
- `name` (text, not null)
- `accountId` (text, FK -> accounts.id, not null)
- `accountEmail` (text, nullable)
- `personalEmail` (text, nullable)
- `linkedinUrl` (text, nullable)
- `createdAt`, `updatedAt` (timestamps)

`**toolRuns` table changes:

- Add `accountId` (text, FK -> accounts.id, nullable) -- nullable for backwards compat with existing runs

---

## Phase 2: Account CRUD API

Create new API routes in the NextJS app:

- `GET /api/accounts` -- list all accounts (searchable via `?q=` param)
- `POST /api/accounts` -- create a new account (also triggers Google Drive folder creation)
- `GET /api/accounts/[id]` -- get single account
- `PUT /api/accounts/[id]` -- update account
- `GET /api/accounts/[id]/contacts` -- list contacts for an account

---

## Phase 3: Contact CRUD API

- `GET /api/contacts?accountId=<id>&q=<search>` -- list/search contacts, optionally filtered by account
- `POST /api/contacts` -- create contact (requires `accountId`)
- `PUT /api/contacts/[id]` -- update contact

---

## Phase 4: Google Drive Folder Creation

Upgrade [src/lib/gdrive.ts](src/lib/gdrive.ts):

1. **Change OAuth scope** from `drive.readonly` to `drive` (full access) to allow folder creation.
2. **Add `createFolder(name, parentFolderId)` function** that creates a subfolder inside the root shared drive folder (`GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID`).
3. **Add `shareFolder(folderId, email)` function** to set permissions if needed (the service account should already have access since it creates the folder under a shared parent).
4. **On account creation** (`POST /api/accounts`): call `createFolder(accountName, rootFolderId)` and store the returned folder ID as `googleDriveFolderId` on the account.

---

## Phase 5: Account Selector in Sidebar

Modify [src/components/sidebar.tsx](src/components/sidebar.tsx):

1. Add a **searchable dropdown** at the top of the sidebar (below the "MVRX Labs" header, above the nav items).
2. The dropdown:

- Fetches accounts via `GET /api/accounts?q=...` as the user types
- Shows matching accounts in a dropdown list
- Has a "Create Account" option at the bottom when no exact match (or always visible)
- Clicking "Create Account" opens a modal with fields: `name`, `industry`, `website`

1. On account selection, update the URL query parameter `?account=<id>` using `useRouter` / `useSearchParams`.
2. Persist the selected account ID so it carries across page navigations.

---

## Phase 6: Account Context Provider

Create a new context provider to avoid prop-drilling:

- `**src/components/account-provider.tsx`: React context that reads `?account=` from the URL, fetches account details, and provides `{ account, contacts, setAccount }` to children.
- Wrap the app in this provider in [src/app/layout.tsx](src/app/layout.tsx).
- Expose a `useAccount()` hook.

---

## Phase 7: No-Account Warning State

When no account is selected (`?account=` missing or invalid):

- Show a persistent, prominent warning banner at the top of the main content area (not a blocking overlay -- user can still see the UI).
- The banner should say something like: "No account selected. Please select an account from the sidebar to continue."
- Style: red/orange border, attention-grabbing but not modal.

---

## Phase 8: Update Tool Forms

Modify [src/lib/types.ts](src/lib/types.ts) and [src/components/tool-form.tsx](src/components/tool-form.tsx):

### Field changes per tool:

| Tool               | Remove        | Replace with contact picker                                | Keep as-is                                         |
| ------------------ | ------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| LinkedIn Audit     | `companyName` | `linkedinUrl` -> contact picker (linkedinUrl from contact) | --                                                 |
| Post Humanizer     | --            | --                                                         | `postContent`, `tone`, `writingExamples`           |
| GTM Strategy       | `companyName` | --                                                         | `industry`, `targetAudience`, `productDescription` |
| Sentiment Analysis | `companyName` | --                                                         | `productName`, `sources`, `urls`, `keywords`       |
| Outbound Sequence  | --            | --                                                         | `targetPersona`, `valueProp`, `steps`, `channel`   |

### Add a new field type `"contact"` to `ToolField`:

- Renders as a searchable dropdown of contacts from the active account
- Fetches via `GET /api/contacts?accountId=<activeAccountId>&q=...`
- If no results and user presses Enter, opens a **Create Contact modal** with fields: `name`, `accountEmail`, `personalEmail`, `linkedinUrl`
- The created contact is auto-selected

### Update tool form submission:

- In `handleSubmit`, include `accountId` in the POST body
- For contact fields, include the contact ID and resolve relevant contact data (e.g., `linkedinUrl`) server-side or client-side

---

## Phase 9: Update Backend API Routes

For each tool route in `src/app/api/tools/`:

1. Accept `accountId` in the request body.
2. If `accountId` is provided, look up the account to get `name` (replaces `companyName` input).
3. Store `accountId` on the `toolRuns` record.
4. Pass account data downstream to the local-api jobs.

Affected routes:

- [src/app/api/tools/linkedin-audit/route.ts](src/app/api/tools/linkedin-audit/route.ts) -- get `companyName` from account, resolve `linkedinUrl` from contact
- [src/app/api/tools/gtm-strategy/route.ts](src/app/api/tools/gtm-strategy/route.ts) -- get `companyName` from account
- [src/app/api/tools/sentiment-analysis/route.ts](src/app/api/tools/sentiment-analysis/route.ts) -- get `companyName` from account

The local-api jobs themselves don't need to change -- they still receive `companyName` as a string, it just comes from the account record now.

---

## Phase 10: Update History Page

Modify [src/app/history/page.tsx](src/app/history/page.tsx) and [src/app/api/history/route.ts](src/app/api/history/route.ts):

- Add an **account filter** dropdown (alongside existing tool/status filters).
- Accept `?account=<id>` query param in the API.
- When an account is selected in the sidebar, auto-filter history to that account.
- Show the account name in the history table.

---

## Phase 11: Update Resources Page

Modify [src/app/resources/page.tsx](src/app/resources/page.tsx) and [src/app/api/resources/route.ts](src/app/api/resources/route.ts):

- When an account is selected, use the account's `googleDriveFolderId` as the root folder instead of the env variable default.
- When no account is selected, either show all resources (from the global root) or show a prompt to select an account.
- Pass `accountId` to the resources API, which resolves the folder ID from the database.

---

## Phase 12: Create Contact Modal Component

Create `**src/components/create-contact-modal.tsx`:

- Modal overlay with form fields: `name` (required), `accountEmail`, `personalEmail`, `linkedinUrl`
- Pre-fills `accountId` from the active account
- On submit, POST to `/api/contacts`
- Returns the new contact to the caller (so the contact picker can auto-select it)

Similarly, the account creation UI in the sidebar dropdown will need a small modal or inline form for creating new accounts.

---

## Summary of files to create/modify

**New files:**

- `src/components/account-selector.tsx` -- searchable dropdown + create account
- `src/components/account-provider.tsx` -- React context for active account
- `src/components/contact-picker.tsx` -- searchable contact dropdown with create
- `src/components/create-contact-modal.tsx` -- modal for new contact
- `src/app/api/accounts/route.ts` -- list + create accounts
- `src/app/api/accounts/[id]/route.ts` -- get + update account
- `src/app/api/accounts/[id]/contacts/route.ts` -- list contacts for account
- `src/app/api/contacts/route.ts` -- list/search + create contacts
- `src/app/api/contacts/[id]/route.ts` -- update contact

**Modified files:**

- `src/lib/schema.ts` -- add `accounts`, `contacts` tables; add `accountId` to `toolRuns`
- `src/lib/types.ts` -- add `"contact"` field type; remove `companyName` fields
- `src/lib/gdrive.ts` -- upgrade scope; add `createFolder()`
- `src/components/sidebar.tsx` -- add account selector at top
- `src/components/tool-form.tsx` -- handle `"contact"` field type; pass `accountId` in submissions
- `src/app/layout.tsx` -- wrap with AccountProvider
- `src/middleware.ts` -- no change needed (account comes from URL, not auth)
- `src/app/api/tools/linkedin-audit/route.ts` -- resolve account/contact data
- `src/app/api/tools/gtm-strategy/route.ts` -- resolve account name
- `src/app/api/tools/sentiment-analysis/route.ts` -- resolve account name
- `src/app/api/history/route.ts` -- accept account filter
- `src/app/history/page.tsx` -- add account filter UI
- `src/app/api/resources/route.ts` -- resolve folder from account
- `src/app/resources/page.tsx` -- use account's folder
- `.env.example` -- no new env vars needed (Drive creds already exist)
