"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { orgDashboardDataSchema, type OrgDashboardData } from "@/lib/api-schemas/org-dashboard";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

// Theme colors (same as account-dashboard)
const BLUE = "#3b82f6";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const GRID = "#222222";
const MUTED = "#888888";
const TOOLTIP_BG = "#111111";
const TOOLTIP_BORDER = "#333333";

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

function formatWeekLabel(week: string): string {
  const d = new Date(week + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// --- Tool name formatting ---

function formatToolName(tool: string): string {
  return tool.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Status badge ---

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/20 text-green-400",
    running: "bg-blue-500/20 text-blue-400",
    failed: "bg-red-500/20 text-red-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    queued: "bg-yellow-500/20 text-yellow-400",
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none whitespace-nowrap ${
        styles[status] ?? "bg-gray-500/20 text-gray-400"
      }`}
    >
      {status}
    </span>
  );
}

// --- Engagement Over Time ---

function OrgEngagementChart({ data }: { data: OrgDashboardData["engagementPerWeek"] }) {
  if (data.length === 0) return null;
  const chartData = data.slice(-12).map((d) => ({ ...d, label: formatWeekLabel(d.week) }));
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Org-wide Customer Engagement Over Time</h3>
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

// --- Recent Tool Runs ---

interface RecentRun {
  id: string;
  tool: string;
  status: string;
  accountName: string | null;
  createdAt: string;
}

function RecentRunsList({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3">Recent Tool Runs</h3>
        <p className="text-sm text-[var(--muted)]">No recent runs.</p>
      </div>
    );
  }
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Recent Tool Runs</h3>
      <div className="space-y-2">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{formatToolName(run.tool)}</span>
            <span className="text-xs text-[var(--muted)] truncate max-w-[100px]">{run.accountName ?? "—"}</span>
            <StatusBadge status={run.status} />
            <span className="text-xs text-[var(--muted)] whitespace-nowrap">
              {new Date(run.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Tool Usage Chart ---

function ToolUsageChart({ data }: { data: OrgDashboardData["toolUsage"] }) {
  if (data.length === 0) return null;
  const chartData = data.slice(0, 15).map((d) => ({ ...d, label: formatToolName(d.tool) }));
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Tool Usage (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 32)}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={160}
          />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="count" fill={BLUE} radius={[0, 3, 3, 0]} name="Runs" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Account Engagement Comparison ---

function AccountLeaderboardChart({
  data,
  onSelectAccount,
}: {
  data: OrgDashboardData["accountLeaderboard"];
  onSelectAccount: (accountId: string) => void;
}) {
  if (data.length === 0) return null;
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold mb-3">Account Engagement Comparison</h3>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 50)}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="accountName"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />
          <Bar dataKey="likes" fill={BLUE} name="Likes" stackId="a" />
          <Bar dataKey="comments" fill={GREEN} name="Comments" stackId="a" />
          <Bar
            dataKey="reposts"
            fill={AMBER}
            name="Reposts"
            stackId="a"
            radius={[0, 3, 3, 0]}
            onClick={(_entry, index) => {
              if (typeof index === "number" && data[index]) {
                onSelectAccount(data[index].accountId);
              }
            }}
            cursor="pointer"
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-[var(--muted)] mt-2">Click a bar to view account dashboard</p>
    </div>
  );
}

// --- Main Org Dashboard ---

export function OrgDashboard() {
  const router = useRouter();
  const [data, setData] = useState<OrgDashboardData | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashData, historyRes] = await Promise.all([
        apiFetch("/api/dashboard", orgDashboardDataSchema),
        fetch("/api/history?limit=10").then((r) => r.json()),
      ]);
      setData(dashData);
      const runs = (historyRes.runs ?? []) as Array<{
        id: string;
        tool: string;
        status: string;
        accountName: string | null;
        createdAt: string;
      }>;
      // Filter out knowledge-slack-events noise
      setRecentRuns(runs.filter((r) => r.tool !== "knowledge-slack-events").slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectAccount = (accountId: string) => {
    router.push(`/dashboard?account=${accountId}`);
  };

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

  return (
    <div>
      <OrgEngagementChart data={data.engagementPerWeek} />
      <AccountLeaderboardChart data={data.accountLeaderboard} onSelectAccount={handleSelectAccount} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentRunsList runs={recentRuns} />
        <ToolUsageChart data={data.toolUsage} />
      </div>
    </div>
  );
}
