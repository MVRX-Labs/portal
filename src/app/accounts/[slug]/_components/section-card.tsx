"use client";

import React, { useState } from "react";

export function SectionCard({
  title,
  count,
  action,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  count?: number | string;
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card p-0">
      <div
        className={`flex items-center justify-between px-4 py-3 ${collapsible ? "cursor-pointer" : ""}`}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide">
          {title}
          {count !== undefined && <span className="ml-1">({count})</span>}
        </h2>
        <div className="flex items-center gap-2">
          {action}
          {collapsible && <span className="text-xs text-(--muted)">{open ? "\u25BC" : "\u25B6"}</span>}
        </div>
      </div>
      {(!collapsible || open) && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
