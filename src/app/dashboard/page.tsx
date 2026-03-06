"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TOOLS } from "@/lib/types";
import { formatRelativeTime } from "@/lib/date-utils";

interface LastRunInfo {
  status: string;
  createdAt: string;
  updatedAt: string;
}

type LastRunMap = Record<string, LastRunInfo>;

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  completed: { dot: "bg-green-500", label: "✓" },
  failed: { dot: "bg-red-500", label: "✗" },
  running: { dot: "bg-amber-500 animate-pulse", label: "⟳" },
  pending: { dot: "bg-gray-400", label: "⏳" },
};

function LastRunBadge({ run }: { run: LastRunInfo }) {
  const config = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const timeStr = formatRelativeTime(run.updatedAt);

  return (
    <div className="flex items-center gap-1.5 mt-2 text-xs">
      <span className={`inline-block w-2 h-2 rounded-full ${config.dot}`} />
      <span className="text-(--muted)">
        {config.label} {timeStr}
      </span>
    </div>
  );
}

function LastRunSkeleton() {
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="inline-block w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
      <span className="inline-block h-3 w-16 rounded bg-gray-200 animate-pulse" />
    </div>
  );
}

export default function DashboardPage() {
  const [lastRuns, setLastRuns] = useState<LastRunMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/tools/last-runs")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LastRunMap) => setLastRuns(data))
      .catch(() => setLastRuns({}))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-sm text-(--muted) mb-6">Select a tool to get started</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TOOLS.map((tool) => {
          const run = lastRuns?.[tool.id];

          return (
            <Link key={tool.id} href={tool.href}>
              <div className="card hover:border-(--accent) transition-colors cursor-pointer h-full">
                <h2 className="text-base font-semibold mb-1">{tool.name}</h2>
                <p className="text-sm text-(--muted)">{tool.description}</p>

                {!loaded ? (
                  <LastRunSkeleton />
                ) : run ? (
                  <LastRunBadge run={run} />
                ) : (
                  <p className="text-xs text-(--muted) opacity-60 mt-2">No runs yet</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
