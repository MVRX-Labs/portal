"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, type Account } from "./account-provider";

export function AccountSelector() {
  const { account, setAccount } = useAccount();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      try {
        const params = query ? `?q=${encodeURIComponent(query)}` : "";
        const res = await fetch(`/api/accounts${params}`);
        const data = await res.json();
        setResults(data.accounts || []);
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowCreate(false);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          industry: newIndustry.trim() || null,
          website: newWebsite.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccount(data.account.id);
        setShowCreate(false);
        setOpen(false);
        setNewName("");
        setNewIndustry("");
        setNewWebsite("");
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative px-4 py-3 border-b border-[var(--border)]">
      <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
        Account
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left text-sm px-2 py-1.5 rounded bg-[var(--input)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors truncate"
      >
        {account ? account.name : "Select account..."}
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg max-h-64 overflow-auto">
          <div className="p-2 border-b border-[var(--border)]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts..."
              className="w-full text-xs px-2 py-1"
              autoFocus
            />
          </div>

          {results.map((acc) => (
            <button
              key={acc.id}
              onClick={() => handleSelect(acc)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--input)] transition-colors ${
                account?.id === acc.id ? "text-[var(--accent)]" : ""
              }`}
            >
              <div className="font-medium truncate">{acc.name}</div>
              {acc.industry && (
                <div className="text-xs text-[var(--muted)]">{acc.industry}</div>
              )}
            </button>
          ))}

          {results.length === 0 && query && (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">
              No accounts found
            </div>
          )}

          <div className="border-t border-[var(--border)]">
            {account && (
              <button
                onClick={handleClear}
                className="w-full text-left px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--input)] transition-colors"
              >
                Clear selection
              </button>
            )}
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="w-full text-left px-3 py-2 text-sm text-[var(--accent)] hover:bg-[var(--input)] transition-colors"
            >
              + Create Account
            </button>
          </div>

          {showCreate && (
            <form
              onSubmit={handleCreate}
              className="p-3 border-t border-[var(--border)] space-y-2"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Account name *"
                className="w-full text-xs px-2 py-1"
                required
              />
              <input
                type="text"
                value={newIndustry}
                onChange={(e) => setNewIndustry(e.target.value)}
                placeholder="Industry"
                className="w-full text-xs px-2 py-1"
              />
              <input
                type="text"
                value={newWebsite}
                onChange={(e) => setNewWebsite(e.target.value)}
                placeholder="Website"
                className="w-full text-xs px-2 py-1"
              />
              <button
                type="submit"
                disabled={creating}
                className="btn-primary w-full text-xs"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
