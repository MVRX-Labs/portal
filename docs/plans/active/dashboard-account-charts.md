# Dashboard: Account-Level Charts

When an account is selected on the Dashboard page, show charts and KPIs derived from existing DB data.

## Charting Library

No charting library is currently installed. **Recommendation: `recharts`** — lightweight, React-native, composable, widely used. Alternatives: Tremor (heavier, opinionated), Nivo (nice but large bundle).

```
npm install recharts
```

---

## Charts to Build

### 1. Post Activity Over Time (Bar Chart)

**What:** Number of posts published per week, over the last 12 weeks.

**Query:** `linkedinPosts` where `accountId = ?`, group by ISO week of `postedAt`.

**Visual:** Vertical bar chart. X-axis = week label (e.g. "Mar 3"), Y-axis = post count. One color.

**Why useful:** Shows whether the account's posting cadence is consistent, increasing, or dropping off.

---

### 2. Engagement Over Time (Line Chart)

**What:** Total engagement (likes + comments + reposts) per week, stacked or as separate lines.

**Query:** `linkedinPostSnapshots` where `accountId = ?`, grouped by ISO week of `capturedAt`. Sum `likesCount`, `commentsCount`, `repostsCount` per week. If snapshots are sparse, fall back to `linkedinPosts` grouped by `postedAt` week (using current counts — less accurate but still useful).

**Visual:** Multi-line chart with 3 lines (likes, comments, reposts) or an area chart. X-axis = week, Y-axis = count.

**Why useful:** The core trend chart — are engagements growing or declining?

---

### 3. Engagement Breakdown (Donut/Pie Chart)

**What:** All-time split of likes vs. comments vs. reposts for this account.

**Query:** `linkedinPosts` where `accountId = ?`. Sum `likesCount`, `commentsCount`, `repostsCount`.

**Visual:** Donut chart with 3 segments. Show percentages. Use distinct colors.

**Why useful:** Quick signal on the type of engagement the account attracts — vanity (likes) vs. meaningful (comments).

---

### 4. Lead Accumulation (Area Chart)

**What:** Cumulative lead count over time.

**Query:** `leads` where `accountId = ?`, ordered by `firstSeenAt`. Compute running total by week.

**Visual:** Filled area chart. X-axis = week, Y-axis = cumulative leads. Single color.

**Why useful:** Shows the flywheel effect — are LinkedIn posts generating a growing lead pool?

---

### 5. Top Posts Table (Ranked List — no chart lib needed)

**What:** Top 5 posts by total engagement for this account.

**Query:** `linkedinPosts` where `accountId = ?`, order by `(likesCount + commentsCount + repostsCount) DESC`, limit 5.

**Visual:** Simple table/card list with post snippet (first 100 chars), engagement count, and posted date. Link to LinkedIn post.

**Why useful:** Quickly see which content resonated most.

---

### 6. Profile Comparison (Horizontal Bar Chart)

**What:** Per-profile engagement totals (only relevant if account has multiple managed profiles).

**Query:** `linkedinPosts` where `accountId = ?`, group by `profileId`. Join `linkedinProfiles` for display names.

**Visual:** Horizontal bar chart, one bar per profile, segmented by likes/comments/reposts.

**Why useful:** Compare performance across multiple managed profiles for the same client.

---

### 7. KPI Summary Cards (No chart lib needed)

**What:** 4 cards at the top — Total Posts, Total Engagement, Total Leads, Posts This Week.

**Query:**

- `linkedinPosts` count where `accountId = ?`
- `linkedinPosts` sum engagement where `accountId = ?`
- `leads` count where `accountId = ?`
- `linkedinPosts` count where `accountId = ?` and `postedAt >= weekStart`

**Visual:** Same card style as the existing analytics page KPIs.

---

## API Endpoint

New endpoint: `GET /api/accounts/[id]/dashboard`

Returns all chart data in one response to avoid waterfall fetches:

```ts
interface DashboardData {
  kpis: {
    totalPosts: number;
    totalEngagement: number;
    totalLeads: number;
    postsThisWeek: number;
  };
  postsPerWeek: Array<{ week: string; count: number }>;
  engagementPerWeek: Array<{
    week: string;
    likes: number;
    comments: number;
    reposts: number;
  }>;
  engagementBreakdown: {
    likes: number;
    comments: number;
    reposts: number;
  };
  leadsPerWeek: Array<{ week: string; cumulative: number }>;
  topPosts: Array<{
    id: string;
    content: string;
    postUrl: string;
    postedAt: string | null;
    likes: number;
    comments: number;
    reposts: number;
    engagement: number;
    profileName: string;
  }>;
  profileComparison: Array<{
    profileId: string;
    displayName: string;
    likes: number;
    comments: number;
    reposts: number;
  }>;
}
```

## Server-Side Function

`src/lib/dashboard-data.ts` — single function `getAccountDashboardData(accountId: string): Promise<DashboardData>`

All queries use Drizzle against existing tables. No new tables or migrations needed.

Key queries:

- Posts per week: `SELECT date_trunc('week', posted_at) as week, count(*) FROM linkedin_posts WHERE account_id = ? AND posted_at IS NOT NULL GROUP BY week ORDER BY week`
- Engagement per week: Same grouping, summing likes/comments/reposts
- Leads per week: `SELECT date_trunc('week', first_seen_at) as week, count(*) FROM leads WHERE account_id = ? GROUP BY week ORDER BY week` then compute cumulative in JS
- Top posts: Simple order by engagement desc, limit 5
- Profile comparison: Group by profile_id, sum engagement columns

## Client Components

`src/app/dashboard/account-dashboard.tsx` — renders when `account` is non-null. Contains:

- `<KpiCards data={data.kpis} />`
- `<PostActivityChart data={data.postsPerWeek} />`
- `<EngagementChart data={data.engagementPerWeek} />`
- `<EngagementBreakdownChart data={data.engagementBreakdown} />`
- `<LeadGrowthChart data={data.leadsPerWeek} />`
- `<TopPostsList data={data.topPosts} />`
- `<ProfileComparisonChart data={data.profileComparison} />` (only if > 1 profile)

All chart components live in the same file or a `dashboard/charts.tsx` file — no need for a separate directory since they're small recharts wrappers.

## Dashboard Page Update

```tsx
// src/app/dashboard/page.tsx
export default function DashboardPage() {
  const { account } = useAccount();

  if (account) {
    return <AccountDashboard accountId={account.id} />;
  }

  return (
    // existing tool selector grid
  );
}
```

## Implementation Order

1. `npm install recharts`
2. `src/lib/dashboard-data.ts` — data function with all queries
3. `src/app/api/accounts/[id]/dashboard/route.ts` — API route
4. `src/lib/api-schemas/dashboard.ts` — Zod schema for response validation
5. `src/app/dashboard/account-dashboard.tsx` — chart components + layout
6. Update `src/app/dashboard/page.tsx` — conditionally render dashboard
