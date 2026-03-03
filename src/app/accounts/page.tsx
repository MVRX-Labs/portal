"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";

interface AccountOverview {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  ownerId: string | null;
  ownerName: string | null;
  mrr: number;
  lastMeetingAt: string | null;
  nextMeetingAt: string | null;
  autoCreated: boolean;
  contactCount: number;
  pendingActionCount: number;
}

interface Contact {
  id: string;
  name: string;
  accountEmail: string | null;
  personalEmail: string | null;
  linkedinUrl: string | null;
  lastMeetingAt: string | null;
  autoCreated: boolean;
}

interface Action {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

function formatMrr(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "No data";
  return new Date(iso).toLocaleDateString();
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

function ExpandedView({
  account,
  users,
  onSave,
}: {
  account: AccountOverview;
  users: User[];
  onSave: (updated: AccountOverview) => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [addingAction, setAddingAction] = useState(false);

  // Editable fields
  const [summary, setSummary] = useState(account.summary || "");
  const [ownerId, setOwnerId] = useState(account.ownerId || "");
  const [mrr, setMrr] = useState(String(account.mrr / 100));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts);
      }
    } catch {
      // ignore
    } finally {
      setLoadingContacts(false);
    }
  }, [account.id]);

  const fetchActions = useCallback(async () => {
    setLoadingActions(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/actions`);
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions);
      }
    } catch {
      // ignore
    } finally {
      setLoadingActions(false);
    }
  }, [account.id]);

  useEffect(() => {
    fetchContacts();
    fetchActions();
  }, [fetchContacts, fetchActions]);

  const handleAddAction = async () => {
    if (!newActionTitle.trim() || addingAction) return;
    setAddingAction(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newActionTitle.trim() }),
      });
      if (res.ok) {
        setNewActionTitle("");
        await fetchActions();
      }
    } catch {
      // ignore
    } finally {
      setAddingAction(false);
    }
  };

  const handleCompleteAction = async (actionId: string) => {
    try {
      await fetch(`/api/accounts/${account.id}/actions/${actionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      await fetchActions();
    } catch {
      // ignore
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    try {
      await fetch(`/api/accounts/${account.id}/actions/${actionId}`, {
        method: "DELETE",
      });
      await fetchActions();
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const mrrCents = Math.round(parseFloat(mrr || "0") * 100);
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: summary || null,
          ownerId: ownerId || null,
          mrr: mrrCents,
        }),
      });
      if (res.ok) {
        const ownerUser = users.find((u) => u.id === ownerId);
        onSave({
          ...account,
          summary: summary || null,
          ownerId: ownerId || null,
          ownerName: ownerUser?.name || null,
          mrr: mrrCents,
        });
        setDirty(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      {/* Contacts and Actions columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: Contacts */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">
            Contacts ({loadingContacts ? "..." : contacts.length})
          </h3>
          {loadingContacts ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No contacts yet</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between py-2 px-3 rounded bg-[var(--input)] border border-[var(--border)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {contact.name}
                      {contact.autoCreated && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none" title="Auto-created from calendar sync">
                          Auto
                        </span>
                      )}
                    </p>
                    {contact.accountEmail && (
                      <p className="text-xs text-[var(--muted)] truncate">
                        {contact.accountEmail}
                      </p>
                    )}
                  </div>
                  <span className="badge badge-neutral ml-2 whitespace-nowrap shrink-0">
                    {contact.lastMeetingAt
                      ? relativeDate(contact.lastMeetingAt)
                      : "No meetings"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">
            Pending Actions ({loadingActions ? "..." : actions.length})
          </h3>
          {loadingActions ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : (
            <>
              {actions.length === 0 && (
                <p className="text-sm text-[var(--muted)] mb-3">No pending actions</p>
              )}
              <div className="space-y-2 mb-3">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-2 py-2 px-3 rounded bg-[var(--input)] border border-[var(--border)]"
                  >
                    <span className="text-sm flex-1 truncate">{action.title}</span>
                    {action.dueDate && (
                      <span className="text-xs text-[var(--muted)] whitespace-nowrap">
                        Due {formatDate(action.dueDate)}
                      </span>
                    )}
                    <span className="badge badge-pending">{action.status}</span>
                    <button
                      onClick={() => handleCompleteAction(action.id)}
                      className="text-xs text-[var(--success)] hover:underline shrink-0"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => handleDeleteAction(action.id)}
                      className="text-xs text-[var(--destructive)] hover:underline shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newActionTitle}
                  onChange={(e) => setNewActionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAction()}
                  placeholder="Add an action..."
                  className="flex-1"
                />
                <button
                  onClick={handleAddAction}
                  disabled={!newActionTitle.trim() || addingAction}
                  className="btn-primary text-sm whitespace-nowrap"
                >
                  Add
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editable fields */}
      <div className="border-t border-[var(--border)] pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs text-[var(--muted)] mb-1">Summary</label>
            <textarea
              value={summary}
              onChange={(e) => { setSummary(e.target.value); setDirty(true); }}
              placeholder="Describe the state of this account..."
              rows={2}
              className="w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Owner</label>
              <select
                value={ownerId}
                onChange={(e) => { setOwnerId(e.target.value); setDirty(true); }}
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
              <label className="block text-xs text-[var(--muted)] mb-1">MRR ($)</label>
              <input
                type="number"
                value={mrr}
                onChange={(e) => { setMrr(e.target.value); setDirty(true); }}
                placeholder="0"
                min="0"
                step="1"
              />
            </div>
          </div>
        </div>
        {dirty && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountsContent() {
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [acctRes, userRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/admin/users"),
        ]);
        if (acctRes.ok) {
          const data = await acctRes.json();
          setAccounts(data.accounts);
        }
        if (userRes.ok) {
          const data = await userRes.json();
          setUsers(data.users);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = (updated: AccountOverview) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Accounts</h1>
      <p className="text-sm text-[var(--muted)] mb-4">
        Overview of all accounts{!loading && ` \u2014 ${accounts.length} total`}
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-4 pb-2 font-medium">Account</th>
              <th className="p-4 pb-2 font-medium">Summary</th>
              <th className="p-4 pb-2 font-medium">Owner</th>
              <th className="p-4 pb-2 font-medium text-right">MRR</th>
              <th className="p-4 pb-2 font-medium">Last Meeting</th>
              <th className="p-4 pb-2 font-medium">Next Meeting</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                  Loading...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                  No accounts found
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <React.Fragment key={account.id}>
                  <tr
                    onClick={() =>
                      setExpandedId(expandedId === account.id ? null : account.id)
                    }
                    className={`border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--input)] ${
                      expandedId === account.id ? "bg-[var(--input)]" : ""
                    }`}
                  >
                    <td className="p-4">
                      <div className="font-medium flex items-center gap-1.5">
                        {account.name}
                        {account.autoCreated && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none" title="Auto-created from calendar sync — review details">
                            Auto
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {account.contactCount} contact{account.contactCount !== 1 ? "s" : ""}
                        {account.pendingActionCount > 0 && (
                          <span className="ml-2 text-[var(--warning)]">
                            {account.pendingActionCount} action{account.pendingActionCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 max-w-xs">
                      <span className="text-[var(--muted)] truncate block">
                        {account.summary || "\u2014"}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {account.ownerName || (
                        <span className="text-[var(--muted)]">Unassigned</span>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap font-medium">
                      {account.mrr > 0 ? formatMrr(account.mrr) : (
                        <span className="text-[var(--muted)]">$0</span>
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span
                        className={`badge ${account.lastMeetingAt ? "badge-completed" : "badge-neutral"}`}
                      >
                        {relativeDate(account.lastMeetingAt)}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span
                        className={`badge ${account.nextMeetingAt ? "badge-running" : "badge-neutral"}`}
                      >
                        {account.nextMeetingAt
                          ? relativeDate(account.nextMeetingAt)
                          : "None scheduled"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === account.id && (
                    <tr>
                      <td
                        colSpan={6}
                        className="border-b border-[var(--border)] bg-[var(--card)]"
                      >
                        <ExpandedView
                          account={account}
                          users={users}
                          onSave={handleSave}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense
      fallback={<div className="text-[var(--muted)]">Loading...</div>}
    >
      <AccountsContent />
    </Suspense>
  );
}
