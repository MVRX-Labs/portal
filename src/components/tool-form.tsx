"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ToolConfig, ToolRun } from "@/lib/types";
import type { RunDetail } from "@/lib/api-schemas/runs";
import { runDetailSchema } from "@/lib/api-schemas/runs";
import { getHistoryResponseSchema } from "@/lib/api-schemas/history";
import { toolTriggerResponseSchema } from "@/lib/api-schemas/tools";
import { apiFetch, apiMutate } from "@/lib/api-client";
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
  const { account } = useAccount();
  const [values, setValues] = useState<Record<string, string>>({});
  const [model, setModel] = useState("opus");
  const [submitting, setSubmitting] = useState(false);
  const [activeRuns, setActiveRuns] = useState<ActiveRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestDescription, setSuggestDescription] = useState("");
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [history, setHistory] = useState<ToolRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [viewingInputRunId, setViewingInputRunId] = useState<string | null>(null);

  const reconnectToRun = useCallback(async (runId: string, createdAt: string) => {
    try {
      const data = await apiFetch(`/api/runs/${runId}`, runDetailSchema);
      if (data.status === "running" || data.status === "pending") {
        setActiveRuns((prev) => {
          if (prev.some((r) => r.id === data.id)) return prev;
          return [
            ...prev,
            {
              id: data.id,
              status: data.status,
              createdAt,
              triggerRunId: data.triggerRunId ?? undefined,
              publicAccessToken: data.publicAccessToken,
            } as ActiveRun,
          ];
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tool: tool.id, limit: "10" });
      if (account?.id) params.set("account", account.id);
      const data = await apiFetch(`/api/history?${params}`, getHistoryResponseSchema);
      const runs = (data.runs || []) as ToolRun[];
      setHistory(runs);
      setHistoryLoaded(true);

      // Reconnect to all running runs
      const runningRuns = runs.filter((r) => r.status === "running" || r.status === "pending");
      for (const run of runningRuns) {
        reconnectToRun(run.id, run.createdAt);
      }
    } catch {
      // ignore
    }
  }, [tool.id, account?.id, reconnectToRun]);

  const handleRunComplete = useCallback(
    async (completedRunId: string) => {
      try {
        const data = await apiFetch(`/api/runs/${completedRunId}`, runDetailSchema);
        setActiveRuns((prev) => prev.map((r) => (r.id === completedRunId ? ({ ...r, ...data } as ActiveRun) : r)));
      } catch {
        // ignore
      }
      loadHistory();
    },
    [loadHistory]
  );

  const dismissRun = useCallback((runId: string) => {
    setActiveRuns((prev) => prev.filter((r) => r.id !== runId));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data = await apiMutate(`/api/tools/${tool.id}`, toolTriggerResponseSchema, {
        method: "POST",
        body: { ...values, model, accountId: account?.id || null },
      });

      setValues({});
      const newRun: ActiveRun = {
        id: data.id,
        status: data.status,
        createdAt: new Date().toISOString(),
        triggerRunId: data.triggerRunId,
        publicAccessToken: data.publicAccessToken,
      };
      setActiveRuns((prev) => [newRun, ...prev]);

      if (data.status !== "running" && data.status !== "pending") {
        loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuggestSubmit = async () => {
    if (!suggestDescription.trim()) return;
    setSuggestSubmitting(true);
    setSuggestError(null);

    try {
      const data = await apiMutate("/api/tools/suggestion", toolTriggerResponseSchema, {
        method: "POST",
        body: { toolId: tool.id, description: suggestDescription },
      });

      setSuggestDescription("");
      setSuggestOpen(false);
      const newRun: ActiveRun = {
        id: data.id,
        status: data.status,
        createdAt: new Date().toISOString(),
        triggerRunId: data.triggerRunId,
        publicAccessToken: data.publicAccessToken,
      };
      setActiveRuns((prev) => [newRun, ...prev]);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const inProgressRuns = activeRuns.filter((r) => r.status === "running" || r.status === "pending");
  const finishedRuns = activeRuns.filter((r) => r.status === "completed" || r.status === "failed");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{tool.name}</h1>
        <p className="text-(--muted) text-sm">{tool.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={handleSubmit} className="card space-y-4">
            {tool.fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium mb-1">
                  {field.label}
                  {field.required && <span className="text-(--destructive)"> *</span>}
                </label>

                {field.type === "contact" ? (
                  <ContactPicker
                    value={values[field.name] || ""}
                    onChange={(id) => setValues({ ...values, [field.name]: id })}
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
                    <span className="text-(--muted)">{field.label}</span>
                  </label>
                ) : field.type === "textarea" ? (
                  <textarea
                    value={values[field.name] || ""}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    placeholder={field.placeholder}
                    required={field.required}
                    rows={4}
                  />
                ) : field.type === "select" ? (
                  <select
                    value={values[field.name] || ""}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
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
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                )}
              </div>
            ))}

            <div className="flex items-center gap-4">
              {MODELS.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="model" value={m} checked={model === m} onChange={() => setModel(m)} />
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Starting..." : "Run Tool"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSuggestOpen(true);
                  setSuggestError(null);
                }}
              >
                Suggest improvement
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-(--destructive)">
                {error}
              </div>
            )}
          </form>

          {suggestOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60" onClick={() => setSuggestOpen(false)} />
              <div className="relative card w-full max-w-lg mx-4 space-y-4">
                <h2 className="text-lg font-semibold">Suggest improvement for {tool.name}</h2>
                <p className="text-sm text-(--muted)">
                  Describe what you&apos;d like changed. An AI agent will implement it and create a PR.
                </p>
                <textarea
                  value={suggestDescription}
                  onChange={(e) => setSuggestDescription(e.target.value)}
                  placeholder="e.g. Add better error messages when the contact has no LinkedIn URL"
                  rows={6}
                  className="w-full"
                  autoFocus
                />
                {suggestError && (
                  <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-(--destructive)">
                    {suggestError}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setSuggestOpen(false)}
                    disabled={suggestSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSuggestSubmit}
                    disabled={suggestSubmitting || !suggestDescription.trim()}
                  >
                    {suggestSubmitting ? "Submitting..." : "Submit suggestion"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active runs */}
          {activeRuns.length > 0 && (
            <div className="space-y-3">
              {inProgressRuns.length > 0 && (
                <h2 className="text-sm font-semibold">Running ({inProgressRuns.length})</h2>
              )}
              {inProgressRuns.map((run) => (
                <div key={run.id}>
                  {run.triggerRunId && run.publicAccessToken ? (
                    <RunProgress
                      triggerRunId={run.triggerRunId}
                      publicAccessToken={run.publicAccessToken}
                      dbRunId={run.id}
                      createdAt={run.createdAt || new Date().toISOString()}
                      onComplete={() => handleRunComplete(run.id)}
                    />
                  ) : (
                    <div className="p-3 rounded-md bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] text-sm">
                      <p className="font-medium text-(--accent)">Job in progress...</p>
                      <p className="text-(--muted) mt-1">Run ID: {run.id}</p>
                      {run.createdAt && (
                        <p className="text-(--muted) mt-1">Started: {formatTimestamp(run.createdAt)}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {finishedRuns.map((run) => (
                <div key={run.id}>
                  {run.status === "completed" && (
                    <div className="p-3 rounded-md bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-(--success)">Job completed successfully</p>
                        <button
                          type="button"
                          onClick={() => dismissRun(run.id)}
                          className="text-(--muted) hover:text-(--foreground) text-xs"
                        >
                          Dismiss
                        </button>
                      </div>
                      <p className="text-(--muted) mt-1">Run ID: {run.id}</p>
                      <div className="text-(--muted) mt-1">
                        {run.createdAt && <p>Started: {formatTimestamp(run.createdAt)}</p>}
                        {run.updatedAt && <p>Ended: {formatTimestamp(run.updatedAt)}</p>}
                      </div>
                      {run.output && (
                        <pre className="mt-3 p-3 rounded bg-(--background) text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                          {run.output}
                        </pre>
                      )}
                    </div>
                  )}

                  {run.status === "failed" && (
                    <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-(--destructive)">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Job failed</p>
                        <button
                          type="button"
                          onClick={() => dismissRun(run.id)}
                          className="text-(--muted) hover:text-(--foreground) text-xs"
                        >
                          Dismiss
                        </button>
                      </div>
                      <p className="mt-1">{run.error}</p>
                      <p className="text-(--muted) mt-1">Run ID: {run.id}</p>
                      <div className="text-(--muted) mt-1">
                        {run.createdAt && <p>Started: {formatTimestamp(run.createdAt)}</p>}
                        {run.updatedAt && <p>Ended: {formatTimestamp(run.updatedAt)}</p>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold mb-3">Recent runs</h2>
          {!historyLoaded ? (
            <p className="text-xs text-(--muted)">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-(--muted)">No runs yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((run) => (
                <div key={run.id} className="p-2 rounded bg-(--background) text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge badge-${run.status}`}>{run.status}</span>
                    {run.inputs && Object.keys(run.inputs).length > 0 && (
                      <button
                        onClick={() => setViewingInputRunId(run.id)}
                        className="text-(--accent) hover:underline text-xs"
                      >
                        View Input
                      </button>
                    )}
                  </div>
                  <div className="text-(--muted) space-y-0.5 mb-1">
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
                      className="text-(--accent) hover:underline"
                    >
                      View Output
                    </a>
                  )}
                  {!run.outputUrl && run.output && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-(--accent) hover:underline">View Output</summary>
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

      {viewingInputRunId &&
        (() => {
          const run = history.find((r) => r.id === viewingInputRunId);
          if (!run) return null;
          return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60" onClick={() => setViewingInputRunId(null)} />
              <div className="relative bg-(--card) border border-(--border) rounded-lg p-6 w-full max-w-lg shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Run Input</h2>
                  <button
                    onClick={() => setViewingInputRunId(null)}
                    className="text-(--muted) hover:text-(--foreground) text-lg"
                  >
                    &times;
                  </button>
                </div>
                <pre className="p-3 rounded bg-(--background) text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(run.inputs, null, 2)}
                </pre>
              </div>
            </div>,
            document.body
          );
        })()}
    </div>
  );
}
