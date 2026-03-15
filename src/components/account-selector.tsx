"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, type Account } from "./account-provider";
import { getAccountsResponseSchema } from "@/lib/api-schemas/accounts";
import type { AccountListItem } from "@/lib/api-schemas/accounts";
import { apiFetch } from "@/lib/api-client";
import { CreateAccountModal } from "./create-account-modal";

export function AccountSelector({ highlight }: { highlight?: boolean }) {
  const { account, setAccount } = useAccount();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight) {
      setPulsing(true);
      setOpen(true);
      const timer = setTimeout(() => setPulsing(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [highlight]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      try {
        const params = query ? `?q=${encodeURIComponent(query)}` : "";
        const data = await apiFetch(`/api/accounts${params}`, getAccountsResponseSchema);
        setResults(data.accounts || []);
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (acc: Account) => {
    setAccount(acc.id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    setAccount(null);
    setOpen(false);
    setQuery("");
  };

  const handleOpenCreate = () => {
    setOpen(false);
    setShowCreateModal(true);
  };

  const handleCreated = (created: AccountListItem) => {
    setAccount(created.id);
    setShowCreateModal(false);
    setQuery("");
  };

  return (
    <div ref={wrapperRef} className="relative px-4 py-3 border-b border-(--border)">
      <label className="block text-[10px] uppercase tracking-wider text-(--muted) mb-1">Account</label>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full text-left text-sm px-2 py-1.5 rounded bg-(--input) border hover:border-(--accent) transition-colors truncate ${
          pulsing ? "border-(--accent) ring-2 ring-(--accent)/50 animate-pulse" : "border-(--border)"
        }`}
      >
        {account ? account.name : "Select account..."}
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-(--card) border border-(--border) rounded-md shadow-lg max-h-64 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-(--border) space-y-1 shrink-0">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts..."
              className="w-full text-xs px-2 py-1"
              autoFocus
            />
            <button
              onClick={handleOpenCreate}
              className="w-full text-left px-2 py-1.5 text-xs text-(--accent) hover:bg-(--input) rounded transition-colors"
            >
              + Create Account
            </button>
          </div>

          <div className="overflow-auto flex-1">
            {results.map((acc) => (
              <button
                key={acc.id}
                onClick={() => handleSelect(acc)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-(--input) transition-colors ${
                  account?.id === acc.id ? "text-(--accent)" : ""
                }`}
              >
                <div className="font-medium truncate">{acc.name}</div>
                {acc.industry && <div className="text-xs text-(--muted)">{acc.industry}</div>}
              </button>
            ))}

            {results.length === 0 && query && (
              <button
                onClick={handleOpenCreate}
                className="w-full text-left px-3 py-3 text-sm hover:bg-(--input) transition-colors"
              >
                <span className="text-(--muted)">No accounts found — </span>
                <span className="text-(--accent)">Create &ldquo;{query}&rdquo;</span>
              </button>
            )}

            {account && (
              <div className="border-t border-(--border)">
                <button
                  onClick={handleClear}
                  className="w-full text-left px-3 py-2 text-sm text-(--muted) hover:bg-(--input) transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateAccountModal defaultName={query} onCreated={handleCreated} onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
