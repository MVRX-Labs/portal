"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ToolRun } from "@/lib/types";
import { TOOLS } from "@/lib/types";

function HistoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = parseInt(searchParams.get("page") || "1");

  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolFilter, setToolFilter] = useState(
    searchParams.get("tool") || ""
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || ""
  );

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "100");
    if (toolFilter) params.set("tool", toolFilter);
    if (statusFilter) params.set("status", statusFilter);

    setLoading(true);
    fetch(`/api/history?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setRuns(data.runs || []);
      })
      .finally(() => setLoading(false));
  }, [page, toolFilter, statusFilter]);

  const navigate = (newPage: number) => {
    const params = new URLSearchParams();
    params.set("page", String(newPage));
    if (toolFilter) params.set("tool", toolFilter);
    if (statusFilter) params.set("status", statusFilter);
    router.push(`/history?${params}`);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Run History</h1>
      <p className="text-sm text-[var(--muted)] mb-4">
        All tool runs across the organization
      </p>

      <div className="flex gap-3 mb-4">
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All Tools</option>
          {TOOLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="pb-2 pr-4 font-medium">Time</th>
              <th className="pb-2 pr-4 font-medium">User</th>
              <th className="pb-2 pr-4 font-medium">Tool</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Inputs</th>
              <th className="pb-2 font-medium">Output</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                  Loading...
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                  No runs found
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{run.userName || "—"}</td>
                  <td className="py-2 pr-4">
                    {TOOLS.find((t) => t.id === run.tool)?.name || run.tool}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`badge badge-${run.status}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate text-[var(--muted)]">
                    {JSON.stringify(run.inputs).slice(0, 80)}
                  </td>
                  <td className="py-2">
                    {run.outputUrl ? (
                      <a
                        href={run.outputUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => navigate(page - 1)}
          disabled={page <= 1}
          className="btn-secondary"
        >
          Previous
        </button>
        <span className="text-sm text-[var(--muted)]">Page {page}</span>
        <button
          onClick={() => navigate(page + 1)}
          disabled={runs.length < 100}
          className="btn-secondary"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={<div className="text-[var(--muted)]">Loading...</div>}
    >
      <HistoryContent />
    </Suspense>
  );
}
