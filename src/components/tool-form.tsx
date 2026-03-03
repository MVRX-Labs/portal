"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { ToolConfig, ToolRun } from "@/lib/types";
import { ContactPicker } from "./contact-picker";
import { useAccount } from "./account-provider";
import { RunProgress } from "./run-progress";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ToolFormProps {
  tool: ToolConfig;
}

const MODELS = ["haiku", "sonnet", "opus"] as const;

interface ActiveRun {
  id: string;
  status: string;
  output?: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  triggerRunId?: string;
  publicAccessToken?: string;
}

export function ToolForm({ tool }: ToolFormProps) {
  const { data: session } = useSession();
  const { account } = useAccount();
  const [values, setValues] = useState<Record<string, string>>({});
  const [model, setModel] = useState("opus");
  const [submitting, setSubmitting] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ToolRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const reconnectToRun = useCallback(async (runId: string, createdAt: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "running" || data.status === "pending") {
        setActiveRun({
          id: data.id,
          status: data.status,
          createdAt,
          triggerRunId: data.triggerRunId,
          publicAccessToken: data.publicAccessToken,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const userId = session?.user?.id || "";
      const params = new URLSearchParams({ tool: tool.id, limit: "10" });
      if (userId) params.set("user", userId);
      const res = await fetch(`/api/history?${params}`);
      const data = await res.json();
      const runs: ToolRun[] = data.runs || [];
      setHistory(runs);
      setHistoryLoaded(true);

      if (!activeRun) {
        const runningRun = runs.find((r) => r.status === "running" || r.status === "pending");
        if (runningRun) {
          reconnectToRun(runningRun.id, runningRun.createdAt);
        }
      }
    } catch {
      // ignore
    }
  }, [tool.id, session?.user?.id, activeRun, reconnectToRun]);

  const handleRunComplete = useCallback(async () => {
    if (!activeRun) return;
    try {
      const res = await fetch(`/api/runs/${activeRun.id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveRun((prev) => (prev ? { ...prev, ...data } : prev));
      }
    } catch {
      // ignore
    }
    loadHistory();
  }, [activeRun, loadHistory]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setActiveRun(null);

    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, model, accountId: account?.id || null }),
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
        triggerRunId: data.triggerRunId,
        publicAccessToken: data.publicAccessToken,
      });

      if (data.status !== "running" && data.status !== "pending") {
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

              {field.type === "contact" ? (
                <ContactPicker
                  value={values[field.name] || ""}
                  onChange={(id) =>
                    setValues({ ...values, [field.name]: id })
                  }
                  required={field.required}
                />
              ) : field.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values[field.name] === "true"}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [field.name]: e.target.checked ? "true" : "false",
                      })
                    }
                  />
                  <span className="text-[var(--muted)]">
                    Enable LinkedIn profile scraping
                  </span>
                </label>
              ) : field.type === "textarea" ? (
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

          <div className="flex items-center gap-4">
            {MODELS.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="model"
                  value={m}
                  checked={model === m}
                  onChange={() => setModel(m)}
                />
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </label>
            ))}
          </div>

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

          {isRunning && activeRun.triggerRunId && activeRun.publicAccessToken && (
            <RunProgress
              triggerRunId={activeRun.triggerRunId}
              publicAccessToken={activeRun.publicAccessToken}
              dbRunId={activeRun.id}
              createdAt={activeRun.createdAt || new Date().toISOString()}
              onComplete={handleRunComplete}
            />
          )}

          {isRunning && (!activeRun.triggerRunId || !activeRun.publicAccessToken) && (
            <div className="p-3 rounded-md bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] text-sm">
              <p className="font-medium text-[var(--accent)]">Job in progress...</p>
              <p className="text-[var(--muted)] mt-1">Run ID: {activeRun.id}</p>
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
                  {!run.outputUrl && run.output && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[var(--accent)] hover:underline">
                        View Output
                      </summary>
                      <pre className="mt-2 p-2 rounded bg-black/5 text-xs overflow-auto max-h-56 whitespace-pre-wrap">
                        {run.output}
                      </pre>
                    </details>
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
