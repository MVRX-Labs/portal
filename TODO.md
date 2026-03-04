This looked a bit scary:

````Note: One thing to watch — your db.ts uses the postgres (pg-native) driver. Vercel's Neon Postgres works with this, but if you hit connection issues in serverless, you
may need to switch to Neon's serverless driver (@neondatabase/serverless). Cross that bridge if you get there.```

To consider:
Using an external service for email address -> linkedin profile + company lookup

extruct.ai looks a bit interesting
so does https://getlate.dev/

# External Service Setup

## Google Drive (required for /resources)

The resources page uses a Google Cloud service account to list and preview files from a shared Drive folder.

1. Go to https://console.cloud.google.com
2. Create a project (or use existing)
3. Enable the **Google Drive API** (APIs & Services → Library → search "Drive API")
4. Go to **IAM & Admin → Service Accounts** → Create Service Account (name: `mvrx-portal`)
5. On the service account page → **Keys** → Add Key → Create new key → JSON
6. From the downloaded JSON, set these env vars:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` ← `client_email` field
   - `GOOGLE_PRIVATE_KEY` ← `private_key` field (entire PEM string including `-----BEGIN/END-----`)
7. Share the Drive folder with the service account email (Viewer access)
8. Confirm `GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID` is correct (default: `0AKKJC-_KENtdUk9PVA`)

## HeyReach (not yet wired — future)

Planned for the **Outbound Sequence** tool to automate LinkedIn outreach.

When ready to integrate:

1. Get API credentials from HeyReach
2. Add `HEYREACH_API_KEY` to `.env.local`
3. Wire up in the outbound-sequence tool route
````
