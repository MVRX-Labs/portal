"use client";

import { useEffect } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

interface TriggerRunIndicatorProps {
  triggerRunId: string;
  publicAccessToken: string;
  label: string;
  onComplete: () => void;
  onError: () => void;
}

export function TriggerRunIndicator({
  triggerRunId,
  publicAccessToken,
  label,
  onComplete,
  onError,
}: TriggerRunIndicatorProps) {
  const { run, error } = useRealtimeRun(triggerRunId, {
    accessToken: publicAccessToken,
    onComplete: () => onComplete(),
  });

  useEffect(() => {
    if (error || run?.status === "FAILED" || run?.status === "CANCELED") {
      onError();
    }
  }, [error, run?.status, onError]);

  return (
    <div className="flex items-center gap-2 text-xs text-(--accent)">
      <div className="h-3 w-3 rounded-full bg-(--accent) animate-pulse" />
      <span>{label}</span>
    </div>
  );
}
