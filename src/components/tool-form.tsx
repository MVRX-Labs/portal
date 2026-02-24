"use client";

import { useState } from "react";
import type { ToolConfig, ToolRun } from "@/lib/types";

interface ToolFormProps {
  tool: ToolConfig;
}

export function ToolForm({ tool }: ToolFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    status: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ToolRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = async () => {
    if (historyLoaded) return;
    try {
      const res = await fetch(
        `/api/history?tool=${tool.id}&limit=10`
      );
      const data = await res.json();
      setHistory(data.runs || []);
      setHistoryLoaded(true);
    } catch {
      // ignore
    }
  };

  // Load history on mount
  useState(() => {
    loadHistory();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start tool");
      }

      const data = await res.json();
      setResult(data);
      setValues({});
      // Refresh history
      setHistoryLoaded(false);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

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

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Starting..." : "Run Tool"}
          </button>

          {result && (
            <div className="p-3 rounded-md bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-sm">
              <p className="font-medium text-[var(--success)]">
                {result.message}
              </p>
              <p className="text-[var(--muted)] mt-1">Run ID: {result.id}</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}
        </form>

        <div className="card">
          <h2 className="text-sm font-semibold mb-3">Recent Runs</h2>
          {history.length === 0 ? (
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
                    <span className="text-[var(--muted)]">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
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
