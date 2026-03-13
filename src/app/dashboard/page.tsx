"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { getDashboardResponseSchema, type GetDashboardResponse } from "@/lib/api-schemas/dashboard";
import { TOOLS } from "@/lib/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMrr(totalMrr: Record<string, number>): string {
  const parts = Object.entries(totalMrr).map(([currency, amount]) => `${currency}${amount.toLocaleString()}`);
  return parts.length > 0 ? parts.join(" + ") : "$0";
}

export default function DashboardPage() {
  const [data, setData] = useState<GetDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  useEffect(() => {
    apiFetch("/api/dashboard", getDashboardResponseSchema)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-(--muted) py-8 text-center">Loading command center...</div>;
  }

  if (!data) {
    return <div className="text-(--muted) py-8 text-center">Failed to load dashboard data</div>;
  }

  const overdueCount = data.actionsDueSoon.filter((a) => a.isOverdue).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Command Center</h1>
      <p className="text-sm text-(--muted) mb-6">Cross-account operational overview</p>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-(--muted) mb-1">Total MRR</p>
          <p className="text-2xl font-bold">{formatMrr(data.portfolioSummary.totalMrr)}</p>
          {data.portfolioSummary.accountsWithoutNextMeeting > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--warning)" }}>
              {data.portfolioSummary.accountsWithoutNextMeeting} account
              {data.portfolioSummary.accountsWithoutNextMeeting !== 1 ? "s" : ""} with no next meeting
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-(--muted) mb-1">Active Accounts</p>
          <p className="text-2xl font-bold">{data.portfolioSummary.activeAccountCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-(--muted) mb-1">Meetings Today</p>
          <p className="text-2xl font-bold">{data.upcomingMeetings.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-(--muted) mb-1">Overdue Actions</p>
          <p className="text-2xl font-bold" style={overdueCount > 0 ? { color: "var(--destructive)" } : undefined}>
            {overdueCount}
          </p>
        </div>
      </div>

      {/* Middle: Meetings + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <MeetingsPanel meetings={data.upcomingMeetings} />
        <ActionsPanel actions={data.actionsDueSoon} />
      </div>

      {/* Weekly activity summary */}
      <div className="flex gap-4 mb-6 text-sm text-(--muted)">
        <span>This week: {data.recentActivity.toolRunsThisWeek} tool runs</span>
        <span>&middot;</span>
        <span>{data.recentActivity.engagementPostsReviewedThisWeek} engagement posts reviewed</span>
      </div>

      {/* Collapsible Tools section */}
      <div>
        <button
          onClick={() => setToolsExpanded(!toolsExpanded)}
          className="flex items-center gap-2 text-sm font-semibold text-(--muted) hover:text-white transition-colors mb-3"
        >
          <span className={`inline-block transition-transform ${toolsExpanded ? "rotate-90" : ""}`}>&#9656;</span>
          Tools
        </button>
        {toolsExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {TOOLS.map((tool) => (
              <Link key={tool.id} href={tool.href}>
                <div className="card hover:border-(--accent) transition-colors cursor-pointer h-full">
                  <h2 className="text-base font-semibold mb-1">{tool.name}</h2>
                  <p className="text-sm text-(--muted)">{tool.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingsPanel({ meetings }: { meetings: GetDashboardResponse["upcomingMeetings"] }) {
  return (
    <div className="card">
      <h2 className="text-base font-semibold mb-3">Today&apos;s Meetings</h2>
      {meetings.length === 0 ? (
        <p className="text-sm text-(--muted)">No meetings remaining today</p>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <div key={m.eventId} className="flex items-start gap-3">
              <span className="text-sm font-mono text-(--muted) whitespace-nowrap mt-0.5">{formatTime(m.startTime)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.summary || "Untitled meeting"}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.accountNames.map((name) => (
                    <span key={name} className="badge badge-running">
                      {name}
                    </span>
                  ))}
                  {m.contactNames.map((name) => (
                    <span key={name} className="badge badge-neutral">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionsPanel({ actions }: { actions: GetDashboardResponse["actionsDueSoon"] }) {
  return (
    <div className="card">
      <h2 className="text-base font-semibold mb-3">Actions Needing Attention</h2>
      {actions.length === 0 ? (
        <p className="text-sm text-(--muted)">No actions due soon</p>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <div key={a.actionId} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge badge-running">{a.accountName}</span>
                  {a.assigneeName && <span className="text-xs text-(--muted)">{a.assigneeName}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {a.dueDate ? (
                  <span
                    className="text-xs font-medium"
                    style={{ color: a.isOverdue ? "var(--destructive)" : "var(--warning)" }}
                  >
                    {a.isOverdue ? "Overdue" : "Due"} {formatDate(a.dueDate)}
                  </span>
                ) : (
                  <span className="text-xs text-(--muted)">No due date</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
