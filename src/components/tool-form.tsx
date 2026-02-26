"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ToolConfig, ToolRun } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ToolFormProps {
  tool: ToolConfig;
}

export function ToolForm({ tool }: ToolFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeRun, setActiveRun] = useState<{
    id: string;
    status: string;
    output?: string | null;
    error?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ToolRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const stored = localStorage.getItem("mvrx-user");
      const userId = stored ? JSON.parse(stored).id : "";
      const params = new URLSearchParams({ tool: tool.id, limit: "10" });
      if (userId) params.set("user", userId);
      const res = await fetch(`/api/history?${params}`);
      const data = await res.json();
      setHistory(data.runs || []);
      setHistoryLoaded(true);
    } catch {
      // ignore
    }
  }, [tool.id]);

  const pollRunStatus = useCallback(
    async (runId: string) => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return;
        const data = await res.json();

        setActiveRun(data);

        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
          setHistoryLoaded(false);
          loadHistory();
        }
      } catch {
        // Network error, keep polling
      }
    },
    [stopPolling, loadHistory]
  );

  const startPolling = useCallback(
    (runId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => pollRunStatus(runId), POLL_INTERVAL_MS);
    },
    [stopPolling, pollRunStatus]
  );

  useEffect(() => {
    loadHistory();
    return stopPolling;
  }, [loadHistory, stopPolling]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setActiveRun(null);
    stopPolling();

    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start tool");
      }

      setValues({});
      setActiveRun({
        id: data.id,
        status: data.status,
        createdAt: new Date().toISOString(),
      });

      if (data.status === "running" || data.status === "pending") {
        startPolling(data.id);
      } else {
        setHistoryLoaded(false);
        loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const isRunning =
    activeRun?.status === "running" || activeRun?.status === "pending";
  const isStale =
    isRunning &&
    activeRun?.createdAt &&
    Date.now() - new Date(activeRun.createdAt).getTime() > STALE_THRESHOLD_MS;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{tool.name}</h1>
        <p className="text-[var(--muted)] text-sm">{tool.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="card lg:col-span-2 space-y-4">
          {tool.fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium mb-1">
                {field.label}
                {field.required && (
                  <span className="text-[var(--destructive)]"> *</span>
                )}
              </label>

              {field.type === "textarea" ? (
                <textarea
                  value={values[field.name] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [field.name]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={4}
                />
              ) : field.type === "select" ? (
                <select
                  value={values[field.name] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [field.name]: e.target.value })
                  }
                  required={field.required}
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={values[field.name] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [field.name]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                />
              )}
            </div>
          ))}

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || isRunning}
          >
            {submitting
              ? "Starting..."
              : isRunning
                ? "Running..."
                : "Run Tool"}
          </button>

          {isRunning && (
            <div className="p-3 rounded-md bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] text-sm">
              <p className="font-medium text-[var(--accent)]">
                {isStale
                  ? "This is taking longer than expected..."
                  : "Job in progress..."}
              </p>
              <p className="text-[var(--muted)] mt-1">
                Run ID: {activeRun.id}
              </p>
              {activeRun.createdAt && (
                <p className="text-[var(--muted)] mt-1">
                  Started: {formatTimestamp(activeRun.createdAt)}
                </p>
              )}
            </div>
          )}

          {activeRun?.status === "completed" && (
            <div className="p-3 rounded-md bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-sm">
              <p className="font-medium text-[var(--success)]">
                Job completed successfully
              </p>
              <p className="text-[var(--muted)] mt-1">
                Run ID: {activeRun.id}
              </p>
              <div className="text-[var(--muted)] mt-1">
                {activeRun.createdAt && <p>Started: {formatTimestamp(activeRun.createdAt)}</p>}
                {activeRun.updatedAt && <p>Ended: {formatTimestamp(activeRun.updatedAt)}</p>}
              </div>
              {activeRun.output && (
                <pre className="mt-3 p-3 rounded bg-[var(--background)] text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                  {activeRun.output}
                </pre>
              )}
            </div>
          )}

          {activeRun?.status === "failed" && (
            <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-[var(--destructive)]">
              <p className="font-medium">Job failed</p>
              <p className="mt-1">{activeRun.error}</p>
              <p className="text-[var(--muted)] mt-1">
                Run ID: {activeRun.id}
              </p>
              <div className="text-[var(--muted)] mt-1">
                {activeRun.createdAt && <p>Started: {formatTimestamp(activeRun.createdAt)}</p>}
                {activeRun.updatedAt && <p>Ended: {formatTimestamp(activeRun.updatedAt)}</p>}
              </div>
            </div>
          )}

          {error && !activeRun && (
            <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}
        </form>

        <div className="card">
          <h2 className="text-sm font-semibold mb-3">Your Recent Runs</h2>
          {!historyLoaded ? (
            <p className="text-xs text-[var(--muted)]">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No runs yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((run) => (
                <div
                  key={run.id}
                  className="p-2 rounded bg-[var(--background)] text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge badge-${run.status}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="text-[var(--muted)] space-y-0.5 mb-1">
                    <div>Started: {formatTimestamp(run.createdAt)}</div>
                    {(run.status === "completed" || run.status === "failed") && run.updatedAt && (
                      <div>Ended: {formatTimestamp(run.updatedAt)}</div>
                    )}
                  </div>
                  {run.outputUrl && (
                    <a
                      href={run.outputUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      View Output
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
