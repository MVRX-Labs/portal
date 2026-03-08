"use client";

import { useEffect, useState } from "react";
import { toast as toastStore, type Toast } from "@/lib/toast";

const TOAST_DURATION = 6000;

const borderColor: Record<Toast["type"], string> = {
  error: "var(--destructive)",
  success: "var(--success)",
  info: "var(--accent)",
};

const labelColor: Record<Toast["type"], string> = {
  error: "var(--destructive)",
  success: "var(--success)",
  info: "var(--accent)",
};

const labels: Record<Toast["type"], string> = {
  error: "Error",
  success: "Success",
  info: "Info",
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toastStore.subscribe((t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, TOAST_DURATION);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        maxWidth: "420px",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "var(--card)",
            border: `1px solid ${borderColor[t.type]}`,
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            animation: "slideIn 0.2s ease-out",
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
          }}
        >
          <span style={{ color: labelColor[t.type], fontWeight: 600, flexShrink: 0 }}>{labels[t.type]}</span>
          <span style={{ color: "var(--foreground)", wordBreak: "break-word" }}>{t.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            style={{
              marginLeft: "auto",
              color: "var(--muted)",
              background: "none",
              border: "none",
              fontSize: "1rem",
              lineHeight: 1,
              flexShrink: 0,
              padding: "0 0.25rem",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
