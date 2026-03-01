"use client";

import { useAccount } from "./account-provider";

export function AccountWarningBanner() {
  const { account } = useAccount();

  if (account) return null;

  return (
    <div className="mb-4 p-3 rounded-md border border-orange-500/30 bg-orange-500/10 text-sm">
      <p className="font-medium text-orange-400">No account selected</p>
      <p className="text-[var(--muted)] mt-0.5">
        Select an account from the sidebar to get started.
      </p>
    </div>
  );
}
