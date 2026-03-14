"use client";

import Link from "next/link";
import { TOOLS } from "@/lib/types";
import { useAccount } from "@/components/account-provider";
import { AccountDashboard } from "./account-dashboard";

export default function DashboardPage() {
  const { account } = useAccount();

  if (account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-sm text-(--muted) mb-6">{account.name}</p>
        <AccountDashboard accountId={account.id} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-sm text-(--muted) mb-6">Select a tool to get started</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TOOLS.map((tool) => (
          <Link key={tool.id} href={tool.href}>
            <div className="card hover:border-(--accent) transition-colors cursor-pointer h-full">
              <h2 className="text-base font-semibold mb-1">{tool.name}</h2>
              <p className="text-sm text-(--muted)">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
