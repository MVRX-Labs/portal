Complete Rollout Playbook

1. Local Testing

# Terminal 1

npm run dev

# Terminal 2

npx trigger.dev@latest dev

a) Apply migrations
npm run db:migrate

b) Populate profiles
npx tsx scripts/migrate-linkedin-profiles.ts

c) Backfill posts (preserves analytics history)
npx tsx scripts/backfill-linkedin-posts.ts

d) Verify data

- Check linkedin_profiles has entries with correct flags
- Check linkedin_posts has backfilled data
- Check linkedin_post_snapshots has backfilled data

e) Trigger a sync manually — either wait 30 min or go to the Trigger.dev dev dashboard and trigger linkedin-sync-scheduler. Then verify:

- New snapshots appearing
- Comments scraped for recent posts
- Outbound posts getting Slack cards (if Slack tokens configured)
- Engager scraping at window boundaries

f) Test UI pages

- /linkedin-engagement — profiles, posts, jobs
- Analytics dashboard
- Manually trigger /api/accounts/{id}/analytics/scrape

2. Production Deploy

Timing: Deploy on a Tuesday-Thursday to avoid Monday analytics run.

Step 1: Deploy
npm run deploy:prod # DB migrations + Trigger.dev tasks
git push origin main # Vercel deploys Next.js app

At this point: new tables exist but are empty. Old schedulers still work. New scheduler is a no-op (0 profiles).

Step 2: Populate profiles (run immediately)
STORAGE_DATABASE_URL=$PROD_STORAGE_DATABASE_URL npx tsx scripts/migrate-linkedin-profiles.ts

Step 3: Backfill posts (run immediately after Step 2)
STORAGE_DATABASE_URL=$PROD_STORAGE_DATABASE_URL npx tsx scripts/backfill-linkedin-posts.ts

This preserves analytics history. Without it, the analytics dashboard shows empty data until posts accumulate over weeks.

Step 4: Wait for first sync (~30 min). The linkedin-sync-scheduler picks up the profiles and starts scraping. Verify in the Trigger.dev prod dashboard that linkedin-sync-profile runs are completing.

Step 5: Disable old schedulers — in the Trigger.dev dashboard (prod environment), go to Schedules and disable:

- linkedin-engagement-scheduler (every 2h — inbound + outbound, now replaced by linkedin-sync-scheduler)

Don't delete it — just disable the schedule. The task code stays deployed as a fallback.

The old weekly-analytics-scheduler is already updated in code to read from linkedinProfiles — no need to disable it separately.

Step 6: Monitor for 48-72 hours

- Check linkedin-sync-profile runs are succeeding
- Verify engager window scrapes fire (~6h and ~72h after posts)
- Verify linkedin-lead-upsert runs after window scrapes
- Check Slack for outbound post cards and unreplied comment alerts
- Verify analytics data is accumulating

3. Code Tasks After Rollout

Once verified in production (give it a week or so):

a) Remove engagementScrapeEnabled from UI — update create-account-modal.tsx, create-contact-modal.tsx, accounts/page.tsx, and the contacts/accounts API routes to stop referencing this flag. Replace with a flow that creates
linkedinProfiles with inboundEnabled: true.

b) Remove old trigger tasks — delete these files:

- src/trigger/linkedin-engagement-scheduler.ts
- src/trigger/linkedin-engagement-scrape.ts
- src/trigger/outbound-engagement-scrape.ts

c) Remove old lib code — once no remaining callers:

- src/lib/managed-profiles.ts (only used by post-ingestion.ts now)
- src/lib/engagement-bot-db.ts (old engagement CRUD — engagement-slack-action.ts still uses it for backward compat with engpost\_\* posts)

d) Remove old tables — generate a migration that drops:

- managedProfiles, managedPosts, managedPostSnapshots
- engagementProfiles, engagementPosts, engagementJobs, engagementRawResults

e) Remove engagementScrapeEnabled column from accounts and contacts tables (migration).

f) Clean up engagement-slack-action.ts — remove the old-table path (the isNewPost / resolvePost dual-routing). Once all engpost\_\* posts have aged out of active engagement workflows, the old path is dead code.

g) Update docs — docs/architecture.md, docs/design-decisions.md to reflect the new unified system. Move docs/plans/active/linkedin-sync-unification.md to docs/plans/completed/.

Risk Summary

┌─────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────┐
│ Risk │ Mitigation │
├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Analytics shows empty data after deploy │ Backfill script (Step 3) preserves history │
├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Old + new schedulers both run │ Idempotent writes; disable old scheduler in Step 5 │
├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Missing weekly report │ Deploy mid-week; first post-migration Monday report may lack WoW comparison (self-healing) │
├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Engagement page empty │ Profile migration (Step 2) runs in seconds │
├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Lead discovery gap │ Old scheduler works until disabled; new system kicks in after first sync │
└─────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────┘
