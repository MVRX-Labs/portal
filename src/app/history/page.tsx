"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ToolRun } from "@/lib/types";
import { TOOLS } from "@/lib/types";
import { useAccount } from "@/components/account-provider";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function HistoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { account } = useAccount();
  const page = parseInt(searchParams.get("page") || "1");

  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolFilter, setToolFilter] = useState(searchParams.get("tool") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "100");
    if (toolFilter) params.set("tool", toolFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (account) params.set("account", account.id);

    setLoading(true);
    fetch(`/api/history?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setRuns(data.runs || []);
      })
      .finally(() => setLoading(false));
  }, [page, toolFilter, statusFilter, account]);

  const navigate = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    if (toolFilter) params.set("tool", toolFilter);
    if (statusFilter) params.set("status", statusFilter);
    router.push(`/history?${params}`);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Run History</h1>
      <p className="text-sm text-[var(--muted)] mb-4">
        {account ? `Showing runs for ${account.name}` : "All tool runs across the organization"}
      </p>

      <div className="flex gap-3 mb-4">
        <select value={toolFilter} onChange={(e) => setToolFilter(e.target.value)} className="w-48">
          <option value="">All Tools</option>
          {TOOLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
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
              <th className="pb-2 pr-4 font-medium">Started</th>
              <th className="pb-2 pr-4 font-medium">Ended</th>
              <th className="pb-2 pr-4 font-medium">User</th>
              <th className="pb-2 pr-4 font-medium">Account</th>
              <th className="pb-2 pr-4 font-medium">Tool</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Inputs</th>
              <th className="pb-2 font-medium">Output</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[var(--muted)]">
                  Loading...
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[var(--muted)]">
                  No runs found
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatTimestamp(run.createdAt)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {(run.status === "completed" || run.status === "failed") && run.updatedAt
                      ? formatTimestamp(run.updatedAt)
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">{run.userName || "—"}</td>
                  <td className="py-2 pr-4">{run.accountName || "—"}</td>
                  <td className="py-2 pr-4">{TOOLS.find((t) => t.id === run.tool)?.name || run.tool}</td>
                  <td className="py-2 pr-4">
                    <span className={`badge badge-${run.status}`}>{run.status}</span>
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
                    ) : run.output ? (
                      <details>
                        <summary className="cursor-pointer text-[var(--accent)] hover:underline">View text</summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)]">
                          {run.output}
                        </pre>
                      </details>
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
        <button onClick={() => navigate(page - 1)} disabled={page <= 1} className="btn-secondary">
          Previous
        </button>
        <span className="text-sm text-[var(--muted)]">Page {page}</span>
        <button onClick={() => navigate(page + 1)} disabled={runs.length < 100} className="btn-secondary">
          Next
        </button>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
      <HistoryContent />
    </Suspense>
  );
}
