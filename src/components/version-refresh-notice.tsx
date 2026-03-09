"use client";

import { useEffect, useMemo, useState } from "react";
import { VERSION_CHECK_EVENT } from "@/lib/version-check";

type NextWindow = Window & {
  __NEXT_DATA__?: {
    buildId?: string;
  };
};

export function VersionRefreshNotice() {
  const currentBuildId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (window as NextWindow).__NEXT_DATA__?.buildId ?? null;
  }, []);

  const [staleBuildId, setStaleBuildId] = useState<string | null>(null);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentBuildId) return;

    let active = true;

    async function checkVersion() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as { buildId?: string };
        const serverBuildId = data.buildId ?? null;
        if (!active || !serverBuildId || serverBuildId === currentBuildId) return;

        setStaleBuildId(serverBuildId);
      } catch {
        // Ignore version check failures.
      }
    }

    void checkVersion();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    };
    const onRequestedCheck = () => {
      void checkVersion();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(VERSION_CHECK_EVENT, onRequestedCheck);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(VERSION_CHECK_EVENT, onRequestedCheck);
    };
  }, [currentBuildId]);

  const showNotice = staleBuildId !== null && staleBuildId !== dismissedBuildId;
  if (!showNotice) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        zIndex: 10000,
        width: "min(420px, calc(100vw - 2rem))",
        background: "var(--card)",
        border: "1px solid var(--accent)",
        borderRadius: "0.75rem",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
        padding: "1rem",
      }}
    >
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--accent)" }}>Update available</div>
      <div style={{ marginTop: "0.35rem", fontSize: "0.9rem", color: "var(--foreground)" }}>
        A newer version of the app is live. Refresh to load the latest frontend.
      </div>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.9rem", justifyContent: "flex-end" }}>
        <button
          onClick={() => setDismissedBuildId(staleBuildId)}
          style={{
            border: "1px solid var(--border)",
            background: "transparent",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
          }}
        >
          Dismiss
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "white",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
