# Dashboard: Account-Level Charts

**Status: IMPLEMENTED**

## What Was Built

When an account is selected on the Dashboard page, charts and KPIs derived from existing DB data are shown.

### Charts implemented

1. **KPI Summary Cards** — Total Posts, Total Engagement, Total Leads, Posts This Week
2. **Post Activity Over Time** — bar chart, posts per week over last 12 weeks
3. **Engagement Over Time** — line chart, likes/comments/reposts per week
4. **Engagement Breakdown** — donut chart, all-time likes vs. comments vs. reposts split
5. **Lead Accumulation** — area chart, cumulative lead count over time
6. **Top Posts** — table, top 5 posts by engagement with link to LinkedIn
7. **Profile Comparison** — horizontal bar chart (only shown if account has multiple profiles)

### Implementation files

- `src/lib/dashboard-data.ts` — `getAccountDashboardData()` with all Drizzle queries
- `src/lib/api-schemas/dashboard.ts` — Zod schema for API response
- `src/app/api/accounts/[id]/dashboard/route.ts` — GET endpoint returning all chart data in one response
- Dashboard page updated to render `AccountDashboard` component when an account is selected

### Charting library

`recharts` — lightweight, React-native, composable.

### No new DB tables

All queries use existing `linkedinPosts`, `linkedinPostSnapshots`, `leads`, and `linkedinProfiles` tables.
