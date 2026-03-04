"use client";

import Link from "next/link";
import { TOOLS } from "@/lib/types";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-sm text-[var(--muted)] mb-6">Select a tool to get started</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TOOLS.map((tool) => (
          <Link key={tool.id} href={tool.href}>
            <div className="card hover:border-[var(--accent)] transition-colors cursor-pointer h-full">
              <h2 className="text-base font-semibold mb-1">{tool.name}</h2>
              <p className="text-sm text-[var(--muted)]">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
