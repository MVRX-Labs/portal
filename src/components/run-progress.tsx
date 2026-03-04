"use client";

import { useState, useEffect } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

interface RunProgressProps {
  triggerRunId: string;
  publicAccessToken: string;
  dbRunId: string;
  createdAt: string;
  onComplete: () => void;
}

interface ProgressMeta {
  step: string;
  stepNumber: number;
  totalSteps: number;
  percentage: number;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function elapsed(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function RunProgress({ triggerRunId, publicAccessToken, dbRunId, createdAt, onComplete }: RunProgressProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { run, error } = useRealtimeRun(triggerRunId, {
    accessToken: publicAccessToken,
    onComplete: () => onComplete(),
  });

  const progress = (run?.metadata as { progress?: ProgressMeta } | undefined)?.progress;

  void tick;

  const isFinished = run?.status === "COMPLETED" || run?.status === "FAILED" || run?.status === "CANCELED";

  if (error) {
    return (
      <div className="p-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-sm text-[var(--destructive)]">
        <p className="font-medium">Failed to connect to run updates</p>
        <p className="mt-1 text-[var(--muted)]">Run ID: {dbRunId}</p>
      </div>
    );
  }

  if (isFinished) return null;

  return (
    <div className="p-4 rounded-md bg-[rgba(59,130,246,0.08)] border border-[rgba(59,130,246,0.2)] text-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-[var(--accent)]">{progress?.step || "Starting..."}</p>
        <span className="text-xs text-[var(--muted)] tabular-nums">{elapsed(createdAt)}</span>
      </div>

      {progress && (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-[rgba(59,130,246,0.15)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
              style={{ width: `${Math.max(progress.percentage, 3)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>
              Step {progress.stepNumber} of {progress.totalSteps}
            </span>
            <span>{progress.percentage}%</span>
          </div>
        </div>
      )}

      {!progress && (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-[rgba(59,130,246,0.15)] overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-[var(--accent)] animate-pulse" />
          </div>
          <p className="text-xs text-[var(--muted)]">Waiting for task to start...</p>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Run ID: {dbRunId} &middot; Started: {formatTimestamp(createdAt)}
      </p>
    </div>
  );
}
