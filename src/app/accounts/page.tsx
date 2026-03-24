"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { AccountListItem, GetAccountsResponse } from "@/lib/api-schemas/accounts";
import type { User } from "@/lib/api-schemas/admin";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { getAccountsResponseSchema, updateAccountResponseSchema } from "@/lib/api-schemas/accounts";
import { getUsersResponseSchema } from "@/lib/api-schemas/admin";
import { CreateAccountModal } from "@/components/create-account-modal";

function formatMrr(cents: number, currency: string = "$"): string {
  const locale = currency === "\u00A3" ? "en-GB" : "en-US";
  return `${currency}${(cents / 100).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function relativeDate(iso: string | null): string {
  if (!iso) return "No data";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 0) return "Today";
    if (absDays === 1) return "Tomorrow";
    if (absDays < 7) return `In ${absDays}d`;
    return `In ${Math.floor(absDays / 7)}w`;
  }
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function AccountsContent() {
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = showHidden ? "?includeHidden=true" : "";
      const data = await apiFetch(`/api/accounts${params}`, getAccountsResponseSchema);
      setAccounts(data.accounts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleToggleHidden = async (e: React.MouseEvent, account: AccountListItem) => {
    e.preventDefault();
    e.stopPropagation();
    const newHidden = !account.hidden;
    try {
      await apiMutate(`/api/accounts/${account.id}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { hidden: newHidden },
      });
      if (!showHidden && newHidden) {
        setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      } else {
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, hidden: newHidden } : a)));
      }
    } catch {
      // ignore
    }
  };

  const visibleCount = accounts.filter((a) => !a.hidden).length;
  const hiddenCount = accounts.filter((a) => a.hidden).length;

  const mrrTotals = accounts
    .filter((a) => !a.hidden && a.mrr > 0)
    .reduce<Record<string, number>>((acc, a) => {
      const cur = a.mrrCurrency || "$";
      acc[cur] = (acc[cur] || 0) + a.mrr;
      return acc;
    }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-(--muted) cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
              className="w-4 h-auto"
            />
            Show hidden ({hiddenCount})
          </label>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm">
            + Create Account
          </button>
        </div>
      </div>
      <p className="text-sm text-(--muted) mb-4">
        Overview of all accounts
        {!loading && ` \u2014 ${visibleCount} total${showHidden && hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}`}
        {!loading && Object.keys(mrrTotals).length > 0 && (
          <span className="ml-3 font-medium text-(--foreground)">
            Total MRR:{" "}
            {Object.entries(mrrTotals)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cur, cents]) => formatMrr(cents, cur))
              .join(" + ")}
          </span>
        )}
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border) text-left text-(--muted)">
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium text-right">MRR</th>
              <th className="px-3 py-2 font-medium">Last Meeting</th>
              <th className="px-3 py-2 font-medium">Next Meeting</th>
              <th className="px-3 py-2 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-(--muted)">
                  Loading...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-(--muted)">
                  No accounts found
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr
                  key={account.id}
                  className={`border-b border-(--border) transition-colors hover:bg-(--input) ${account.hidden ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-1.5">
                    <Link href={`/accounts/${account.slug}`} className="block">
                      <div className="font-medium flex items-center gap-1.5">
                        {account.name}
                        {account.autoCreated && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none"
                            title="Auto-created from calendar sync"
                          >
                            Auto
                          </span>
                        )}
                        {account.hidden && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--muted)/20 text-(--muted) font-medium leading-none">
                            Hidden
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-(--muted)">
                        {account.contactCount ?? 0} contact{(account.contactCount ?? 0) !== 1 ? "s" : ""}
                        {(account.pendingActionCount ?? 0) > 0 && (
                          <span className="ml-2 text-(--warning)">
                            {account.pendingActionCount ?? 0} action
                            {(account.pendingActionCount ?? 0) !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 max-w-xs">
                    <span className="text-(--muted) truncate block">{account.notes || "\u2014"}</span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {account.ownerName || <span className="text-(--muted)">Unassigned</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">
                    {account.mrr > 0 ? (
                      formatMrr(account.mrr, account.mrrCurrency)
                    ) : (
                      <span className="text-(--muted)">{account.mrrCurrency || "$"}0</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={`badge ${account.lastMeetingAt ? "badge-completed" : "badge-neutral"}`}>
                      {relativeDate(account.lastMeetingAt)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={`badge ${account.nextMeetingAt ? "badge-running" : "badge-neutral"}`}>
                      {account.nextMeetingAt ? relativeDate(account.nextMeetingAt) : "None scheduled"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <button
                      onClick={(e) => handleToggleHidden(e, account)}
                      className={`text-xs hover:underline ${account.hidden ? "text-(--success)" : "text-(--muted)"}`}
                    >
                      {account.hidden ? "Show" : "Hide"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateAccountModal
          onCreated={(account) => {
            setAccounts((prev) => [account, ...prev]);
            setShowCreateModal(false);
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="text-(--muted)">Loading...</div>}>
      <AccountsContent />
    </Suspense>
  );
}
