"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Account } from "@/lib/api-schemas/accounts";
import type { User } from "@/lib/api-schemas/org";
import { apiMutate } from "@/lib/api-client";
import { updateAccountResponseSchema } from "@/lib/api-schemas/accounts";

function InlineEdit({
  value,
  field,
  accountId,
  onSaved,
  placeholder,
  type = "text",
}: {
  value: string;
  field: string;
  accountId: string;
  onSaved: (val: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    setEditing(false);
    if (draft === value) return;
    try {
      await apiMutate(`/api/accounts/${accountId}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { [field]: draft || null },
      });
      onSaved(draft);
    } catch {
      setDraft(value);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left hover:bg-(--input) rounded px-1.5 py-0.5 -mx-1.5 transition-colors truncate max-w-full"
        title="Click to edit"
      >
        {value || <span className="text-(--muted) italic">{placeholder || "Not set"}</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      placeholder={placeholder}
      className="text-sm w-full"
    />
  );
}

export function AccountHeader({
  account,
  users,
  onAccountUpdated,
}: {
  account: Account;
  users: User[];
  onAccountUpdated: (a: Partial<Account>) => void;
}) {
  const [savingOwner, setSavingOwner] = useState(false);
  const [savingMrr, setSavingMrr] = useState(false);
  const [mrr, setMrr] = useState(String(account.mrr / 100));
  const [mrrCurrency, setMrrCurrency] = useState(account.mrrCurrency || "$");

  useEffect(() => {
    setMrr(String(account.mrr / 100));
    setMrrCurrency(account.mrrCurrency || "$");
  }, [account.mrr, account.mrrCurrency]);

  const saveOwner = async (ownerId: string) => {
    setSavingOwner(true);
    try {
      await apiMutate(`/api/accounts/${account.id}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { ownerId: ownerId || null },
      });
      onAccountUpdated({ ownerId: ownerId || null });
    } catch {
      // toast handled
    } finally {
      setSavingOwner(false);
    }
  };

  const saveMrr = async () => {
    const mrrCents = Math.round(parseFloat(mrr || "0") * 100);
    if (mrrCents === account.mrr && mrrCurrency === account.mrrCurrency) return;
    setSavingMrr(true);
    try {
      await apiMutate(`/api/accounts/${account.id}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { mrr: mrrCents, mrrCurrency },
      });
      onAccountUpdated({ mrr: mrrCents, mrrCurrency });
    } catch {
      setMrr(String(account.mrr / 100));
      setMrrCurrency(account.mrrCurrency || "$");
    } finally {
      setSavingMrr(false);
    }
  };

  const driveUrl = account.googleDriveFolderId
    ? `https://drive.google.com/drive/folders/${account.googleDriveFolderId}`
    : null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-sm text-(--muted) mb-2">
        <Link href="/accounts" className="hover:underline">
          Accounts
        </Link>
        <span>/</span>
        <span className="text-(--foreground)">{account.name}</span>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold mb-1">
              <InlineEdit
                value={account.name}
                field="name"
                accountId={account.id}
                onSaved={(v) => onAccountUpdated({ name: v })}
                placeholder="Account name"
              />
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {account.slug && <span className="text-xs text-(--muted)">/{account.slug}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-(--muted) mb-1">Industry</label>
            <InlineEdit
              value={account.industry || ""}
              field="industry"
              accountId={account.id}
              onSaved={(v) => onAccountUpdated({ industry: v || null })}
              placeholder="e.g. SaaS, Healthcare"
            />
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Website</label>
            <InlineEdit
              value={account.website || ""}
              field="website"
              accountId={account.id}
              onSaved={(v) => onAccountUpdated({ website: v || null })}
              placeholder="https://example.com"
              type="url"
            />
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">LinkedIn</label>
            <InlineEdit
              value={account.linkedinUrl || ""}
              field="linkedinUrl"
              accountId={account.id}
              onSaved={(v) => onAccountUpdated({ linkedinUrl: v || null })}
              placeholder="https://linkedin.com/company/..."
              type="url"
            />
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Twitter/X</label>
            <InlineEdit
              value={account.twitterUrl || ""}
              field="twitterUrl"
              accountId={account.id}
              onSaved={(v) => onAccountUpdated({ twitterUrl: v || null })}
              placeholder="https://x.com/username"
              type="url"
            />
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Google Drive</label>
            {driveUrl ? (
              <a href={driveUrl} target="_blank" rel="noreferrer" className="text-sm text-(--accent) hover:underline">
                Open folder
              </a>
            ) : (
              <span className="text-sm text-(--muted) italic">Not set</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div>
            <label className="block text-xs text-(--muted) mb-1">Owner</label>
            <select
              value={account.ownerId || ""}
              onChange={(e) => saveOwner(e.target.value)}
              disabled={savingOwner}
              className="text-sm w-full"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">MRR</label>
            <div className="flex">
              <button
                type="button"
                onClick={() => {
                  const next = mrrCurrency === "$" ? "\u00A3" : "$";
                  setMrrCurrency(next);
                }}
                className="shrink-0 w-8 text-center border border-r-0 border-(--border) rounded-l bg-(--input) text-sm hover:bg-(--border) transition-colors"
                title="Toggle currency"
              >
                {mrrCurrency}
              </button>
              <input
                type="number"
                value={mrr}
                onChange={(e) => setMrr(e.target.value)}
                onBlur={saveMrr}
                onKeyDown={(e) => e.key === "Enter" && saveMrr()}
                placeholder="0"
                min="0"
                step="1"
                disabled={savingMrr}
                className="rounded-l-none flex-1 min-w-0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Last Meeting</label>
            <span className={`badge ${account.lastMeetingAt ? "badge-completed" : "badge-neutral"}`}>
              {account.lastMeetingAt ? relativeDate(account.lastMeetingAt) : "No data"}
            </span>
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Next Meeting</label>
            <span className={`badge ${account.nextMeetingAt ? "badge-running" : "badge-neutral"}`}>
              {account.nextMeetingAt ? relativeDate(account.nextMeetingAt) : "None scheduled"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
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
