"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import { dashboardDataSchema, type DashboardData } from "@/lib/api-schemas/dashboard";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

// Theme colors
const BLUE = "#3b82f6";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PURPLE = "#a855f7";
const GRID = "#222222";
const MUTED = "#888888";
const TOOLTIP_BG = "#111111";
const TOOLTIP_BORDER = "#333333";

const PIE_COLORS = [BLUE, GREEN, AMBER];

function formatWeekLabel(week: string): string {
  const d = new Date(week + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// --- KPI Cards ---

function KpiCards({ data }: { data: DashboardData["kpis"] }) {
  const cards = [
    { label: "Total Posts", value: data.totalPosts },
    { label: "Total Engagement", value: data.totalEngagement.toLocaleString() },
    { label: "Total Leads", value: data.totalLeads },
    { label: "Posts This Week", value: data.postsThisWeek },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <div className="text-2xl font-light">{c.value}</div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// --- Shared tooltip style ---

const tooltipStyle = {
  contentStyle: {
    background: TOOLTIP_BG,
    border: `1px solid ${TOOLTIP_BORDER}`,
    borderRadius: 6,
    fontSize: 12,
    color: "#fff",
  },
  itemStyle: { color: "#fff" },
  labelStyle: { color: MUTED },
};

// --- Post Activity Chart ---

function PostActivityChart({ data }: { data: DashboardData["postsPerWeek"] }) {
  if (data.length === 0) return null;
  const chartData = data.slice(-12).map((d) => ({ ...d, label: formatWeekLabel(d.week) }));
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Posts Per Week</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="count" fill={BLUE} radius={[3, 3, 0, 0]} name="Posts" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Engagement Over Time ---

function EngagementChart({ data }: { data: DashboardData["engagementPerWeek"] }) {
  if (data.length === 0) return null;
  const chartData = data.slice(-12).map((d) => ({ ...d, label: formatWeekLabel(d.week) }));
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Engagement Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />
          <Line type="monotone" dataKey="likes" stroke={BLUE} strokeWidth={2} dot={false} name="Likes" />
          <Line type="monotone" dataKey="comments" stroke={GREEN} strokeWidth={2} dot={false} name="Comments" />
          <Line type="monotone" dataKey="reposts" stroke={AMBER} strokeWidth={2} dot={false} name="Reposts" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Engagement Breakdown Donut ---

function EngagementBreakdownChart({ data }: { data: DashboardData["engagementBreakdown"] }) {
  const total = data.likes + data.comments + data.reposts;
  if (total === 0) return null;
  const pieData = [
    { name: "Likes", value: data.likes },
    { name: "Comments", value: data.comments },
    { name: "Reposts", value: data.reposts },
  ];
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Engagement Breakdown</h3>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={pieData} innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
              {pieData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2 text-sm">
          {pieData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: PIE_COLORS[i] }} />
              <span className="text-[var(--muted)]">{d.name}</span>
              <span className="font-medium">{d.value.toLocaleString()}</span>
              <span className="text-[var(--muted)]">({Math.round((d.value / total) * 100)}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Lead Accumulation ---

function LeadGrowthChart({ data }: { data: DashboardData["leadsPerWeek"] }) {
  if (data.length === 0) return null;
  const chartData = data.map((d) => ({ ...d, label: formatWeekLabel(d.week) }));
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Lead Growth</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={PURPLE}
            fill={PURPLE}
            fillOpacity={0.15}
            strokeWidth={2}
            name="Total Leads"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Posts Table ---

type PostSortKey = "postedAt" | "likes" | "comments" | "reposts" | "engagement";
type SortDir = "asc" | "desc";

function PostsTable({ data }: { data: DashboardData["posts"] }) {
  const [sortKey, setSortKey] = useState<PostSortKey>("postedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "postedAt") {
        av = a.postedAt ? new Date(a.postedAt).getTime() : 0;
        bv = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  if (data.length === 0) return null;

  const toggleSort = (key: PostSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const arrow = (key: PostSortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " \u2193" : " \u2191";
  };

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-white select-none whitespace-nowrap";
  const numTh =
    "px-3 py-2 text-right text-xs font-medium text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-white select-none whitespace-nowrap";

  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">All Posts ({data.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className={thClass} onClick={() => toggleSort("postedAt")}>
                Date{arrow("postedAt")}
              </th>
              <th className={thClass}>Post</th>
              <th className={thClass}>Profile</th>
              <th className={numTh} onClick={() => toggleSort("likes")}>
                Likes{arrow("likes")}
              </th>
              <th className={numTh} onClick={() => toggleSort("comments")}>
                Comments{arrow("comments")}
              </th>
              <th className={numTh} onClick={() => toggleSort("reposts")}>
                Reposts{arrow("reposts")}
              </th>
              <th className={numTh} onClick={() => toggleSort("engagement")}>
                Total{arrow("engagement")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((post) => (
              <tr key={post.id} className="border-b border-[var(--border)] hover:bg-[var(--input)]">
                <td className="px-3 py-2 text-xs text-[var(--muted)] whitespace-nowrap">
                  {post.postedAt
                    ? new Date(post.postedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-3 py-2 max-w-xs">
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--accent)] line-clamp-1"
                  >
                    {post.content.slice(0, 100) || "(no content)"}
                  </a>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--muted)] whitespace-nowrap">{post.profileName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{post.likes.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{post.comments.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{post.reposts.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{post.engagement.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Profile Comparison ---

function ProfileComparisonChart({ data }: { data: DashboardData["profileComparison"] }) {
  if (data.length <= 1) return null;
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Profile Comparison</h3>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 50)}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="displayName"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />
          <Bar dataKey="likes" stackId="a" fill={BLUE} name="Likes" />
          <Bar dataKey="comments" stackId="a" fill={GREEN} name="Comments" />
          <Bar dataKey="reposts" stackId="a" fill={AMBER} name="Reposts" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Main Dashboard ---

export function AccountDashboard({ accountId }: { accountId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch(`/api/accounts/${accountId}/dashboard`, dashboardDataSchema);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <div className="card text-sm text-[var(--destructive)]">
        {error}
        <button onClick={fetchData} className="ml-3 text-[var(--accent)] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasData = data.kpis.totalPosts > 0 || data.kpis.totalLeads > 0;

  if (!hasData) {
    return (
      <div className="card text-center py-8 text-[var(--muted)]">
        No data yet for this account. Post analytics and leads will appear here once available.
      </div>
    );
  }

  return (
    <div>
      <KpiCards data={data.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PostActivityChart data={data.postsPerWeek} />
        <EngagementChart data={data.engagementPerWeek} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngagementBreakdownChart data={data.engagementBreakdown} />
        <LeadGrowthChart data={data.leadsPerWeek} />
      </div>

      <PostsTable data={data.posts} />
      <ProfileComparisonChart data={data.profileComparison} />
    </div>
  );
}
