"use client";

import { useAccount } from "@/components/account-provider";
import { AccountDashboard } from "./account-dashboard";
import { OrgDashboard } from "./org-dashboard";

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
      <p className="text-sm text-(--muted) mb-6">Organization Overview</p>
      <OrgDashboard />
    </div>
  );
}
