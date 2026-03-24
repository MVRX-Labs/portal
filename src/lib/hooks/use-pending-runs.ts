import { useState, useCallback } from "react";

interface PendingRun {
  triggerRunId: string;
  publicAccessToken: string;
}

export function usePendingRuns() {
  const [runs, setRuns] = useState<Record<string, PendingRun>>({});

  const set = useCallback((key: string, triggerRunId: string, publicAccessToken: string) => {
    setRuns((prev) => ({ ...prev, [key]: { triggerRunId, publicAccessToken } }));
  }, []);

  const clear = useCallback((key: string) => {
    setRuns((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const get = useCallback((key: string): PendingRun | null => runs[key] ?? null, [runs]);

  return { runs, set, clear, get };
}
