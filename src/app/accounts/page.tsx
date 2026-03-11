"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import type { AccountListItem, GetAccountsResponse } from "@/lib/api-schemas/accounts";
import type { Action, GetActionsResponse } from "@/lib/api-schemas/actions";
import type { Contact, GetAccountContactsResponse } from "@/lib/api-schemas/contacts";
import type { User } from "@/lib/api-schemas/admin";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { getAccountsResponseSchema, updateAccountResponseSchema } from "@/lib/api-schemas/accounts";
import { getAccountContactsResponseSchema } from "@/lib/api-schemas/contacts";
import {
  getActionsResponseSchema,
  createActionResponseSchema,
  updateActionResponseSchema,
  deleteActionResponseSchema,
} from "@/lib/api-schemas/actions";
import { updateContactBodySchema, updateContactResponseSchema } from "@/lib/api-schemas/contacts";
import { getUsersResponseSchema } from "@/lib/api-schemas/admin";
import { NotesField } from "@/components/notes-field";

function formatMrr(cents: number, currency: string = "$"): string {
  const locale = currency === "£" ? "en-GB" : "en-US";
  return `${currency}${(cents / 100).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

function dueDateStyle(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < now ? "text-(--destructive)" : "text-(--muted)";
}

function ExpandedView({
  account,
  users,
  editMode,
  onSave,
}: {
  account: AccountListItem;
  users: User[];
  editMode: boolean;
  onSave: (updated: AccountListItem) => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [newActionDueDate, setNewActionDueDate] = useState("");
  const [addingAction, setAddingAction] = useState(false);

  // Editable fields
  const [name, setName] = useState(account.name || "");
  const [industry, setIndustry] = useState(account.industry || "");
  const [website, setWebsite] = useState(account.website || "");
  const [linkedinUrl, setLinkedinUrl] = useState(account.linkedinUrl || "");
  const [engagementSlackChannel, setEngagementSlackChannel] = useState(account.engagementSlackChannel || "");
  const [notes, setNotes] = useState(account.notes || "");
  const [contentVoiceGuidance, setContentVoiceGuidance] = useState(account.contentVoiceGuidance || "");
  const [ownerId, setOwnerId] = useState(account.ownerId || "");
  const [mrr, setMrr] = useState(String(account.mrr / 100));
  const [mrrCurrency, setMrrCurrency] = useState(account.mrrCurrency || "$");
  const [engagementScrapeEnabled, setEngagementScrapeEnabled] = useState(account.engagementScrapeEnabled);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Contact editing
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactEdits, setContactEdits] = useState<Partial<Contact>>({});
  const [savingContact, setSavingContact] = useState(false);

  // Reset editable fields when account changes
  useEffect(() => {
    setName(account.name || "");
    setIndustry(account.industry || "");
    setWebsite(account.website || "");
    setLinkedinUrl(account.linkedinUrl || "");
    setEngagementSlackChannel(account.engagementSlackChannel || "");
    setNotes(account.notes || "");
    setContentVoiceGuidance(account.contentVoiceGuidance || "");
    setOwnerId(account.ownerId || "");
    setMrr(String(account.mrr / 100));
    setMrrCurrency(account.mrrCurrency || "$");
    setEngagementScrapeEnabled(account.engagementScrapeEnabled);
    setDirty(false);
  }, [
    account.id,
    account.name,
    account.industry,
    account.website,
    account.linkedinUrl,
    account.engagementSlackChannel,
    account.notes,
    account.contentVoiceGuidance,
    account.ownerId,
    account.mrr,
    account.mrrCurrency,
    account.engagementScrapeEnabled,
  ]);

  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const data = await apiFetch(`/api/accounts/${account.id}/contacts`, getAccountContactsResponseSchema);
      setContacts(data.contacts);
    } catch {
      // ignore
    } finally {
      setLoadingContacts(false);
    }
  }, [account.id]);

  const fetchActions = useCallback(async () => {
    setLoadingActions(true);
    try {
      const data = await apiFetch(`/api/accounts/${account.id}/actions`, getActionsResponseSchema);
      setActions(data.actions);
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
      await apiMutate(`/api/accounts/${account.id}/actions`, createActionResponseSchema, {
        method: "POST",
        body: { title: newActionTitle.trim(), dueDate: newActionDueDate || null },
      });
      setNewActionTitle("");
      setNewActionDueDate("");
      await fetchActions();
    } catch {
      // ignore
    } finally {
      setAddingAction(false);
    }
  };

  const handleCompleteAction = async (actionId: string) => {
    try {
      await apiMutate(`/api/accounts/${account.id}/actions/${actionId}`, updateActionResponseSchema, {
        method: "PUT",
        body: { status: "completed" },
      });
      await fetchActions();
    } catch {
      // ignore
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    try {
      await apiMutate(`/api/accounts/${account.id}/actions/${actionId}`, deleteActionResponseSchema, {
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
      await apiMutate(`/api/accounts/${account.id}`, updateAccountResponseSchema, {
        method: "PUT",
        body: {
          name: name || account.name,
          industry: industry || null,
          website: website || null,
          linkedinUrl: linkedinUrl || null,
          engagementSlackChannel: engagementSlackChannel || null,
          notes: notes || null,
          contentVoiceGuidance: contentVoiceGuidance || null,
          ownerId: ownerId || null,
          mrr: mrrCents,
          mrrCurrency,
          engagementScrapeEnabled,
        },
      });
      const ownerUser = users.find((u) => u.id === ownerId);
      onSave({
        ...account,
        name: name || account.name,
        industry: industry || null,
        website: website || null,
        linkedinUrl: linkedinUrl || null,
        engagementSlackChannel: engagementSlackChannel || null,
        notes: notes || null,
        contentVoiceGuidance: contentVoiceGuidance || null,
        ownerId: ownerId || null,
        ownerName: ownerUser?.name || null,
        mrr: mrrCents,
        mrrCurrency,
        engagementScrapeEnabled,
      });
      setDirty(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactEdits({
      name: contact.name,
      accountEmail: contact.accountEmail,
      personalEmail: contact.personalEmail,
      linkedinUrl: contact.linkedinUrl,
      contentVoiceGuidance: contact.contentVoiceGuidance,
      notes: contact.notes,
      engagementScrapeEnabled: contact.engagementScrapeEnabled,
    });
  };

  const handleSaveContact = async () => {
    if (!editingContactId) return;
    setSavingContact(true);
    try {
      await apiMutate(`/api/contacts/${editingContactId}`, updateContactResponseSchema, {
        method: "PUT",
        body: {
          name: contactEdits.name,
          accountEmail: contactEdits.accountEmail || null,
          personalEmail: contactEdits.personalEmail || null,
          linkedinUrl: contactEdits.linkedinUrl || null,
          contentVoiceGuidance: contactEdits.contentVoiceGuidance || null,
          notes: contactEdits.notes || null,
          engagementScrapeEnabled: contactEdits.engagementScrapeEnabled,
        },
      });
      setContacts((prev) => prev.map((c) => (c.id === editingContactId ? { ...c, ...contactEdits } : c)));
      setEditingContactId(null);
      setContactEdits({});
    } catch {
      // ignore
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div className="p-4">
      {/* Contacts and Actions columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: Contacts */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-(--muted) uppercase tracking-wide">
            Contacts ({loadingContacts ? "..." : contacts.length})
          </h3>
          {loadingContacts ? (
            <p className="text-sm text-(--muted)">Loading...</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-(--muted)">No contacts yet</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <div key={contact.id}>
                  <div className="flex items-center justify-between py-2 px-3 rounded bg-(--input) border border-(--border)">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {contact.name}
                        {contact.autoCreated && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none"
                            title="Auto-created from calendar sync"
                          >
                            Auto
                          </span>
                        )}
                        {contact.engagementScrapeEnabled && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none"
                            title="Engagement scraping enabled"
                          >
                            Scrape
                          </span>
                        )}
                      </p>
                      {contact.accountEmail && (
                        <p className="text-xs text-(--muted) truncate">{contact.accountEmail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="badge badge-neutral whitespace-nowrap">
                        {contact.lastMeetingAt ? relativeDate(contact.lastMeetingAt) : "No meetings"}
                      </span>
                      <span
                        className={`badge whitespace-nowrap ${contact.nextMeetingAt ? "badge-running" : "badge-neutral"}`}
                      >
                        {contact.nextMeetingAt ? relativeDate(contact.nextMeetingAt) : "None scheduled"}
                      </span>
                      {editMode && (
                        <button
                          onClick={() =>
                            editingContactId === contact.id
                              ? setEditingContactId(null)
                              : handleStartEditContact(contact)
                          }
                          className="text-xs text-(--muted) hover:underline"
                        >
                          {editingContactId === contact.id ? "Cancel" : "Edit"}
                        </button>
                      )}
                    </div>
                  </div>
                  {editMode && editingContactId === contact.id && (
                    <div className="mt-1 p-3 rounded bg-(--card) border border-(--border) space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-(--muted) mb-1">Name</label>
                          <input
                            type="text"
                            value={contactEdits.name || ""}
                            onChange={(e) => setContactEdits((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-(--muted) mb-1">LinkedIn URL</label>
                          <input
                            type="text"
                            value={contactEdits.linkedinUrl || ""}
                            onChange={(e) => setContactEdits((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
                            placeholder="https://linkedin.com/in/username"
                            className="w-full text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-(--muted) mb-1">Work Email</label>
                          <input
                            type="email"
                            value={contactEdits.accountEmail || ""}
                            onChange={(e) => setContactEdits((prev) => ({ ...prev, accountEmail: e.target.value }))}
                            className="w-full text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-(--muted) mb-1">Personal Email</label>
                          <input
                            type="email"
                            value={contactEdits.personalEmail || ""}
                            onChange={(e) => setContactEdits((prev) => ({ ...prev, personalEmail: e.target.value }))}
                            className="w-full text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex-1 pr-3">
                          <label className="block text-xs text-(--muted) mb-1">Content Voice Guidance</label>
                          <textarea
                            value={contactEdits.contentVoiceGuidance || ""}
                            onChange={(e) =>
                              setContactEdits((prev) => ({ ...prev, contentVoiceGuidance: e.target.value }))
                            }
                            placeholder="e.g. US spelling. No abbreviations. Avoid vague claims."
                            rows={3}
                            className="w-full text-sm"
                          />
                        </div>
                      </div>
                      <NotesField
                        value={contactEdits.notes || ""}
                        onChange={(v) => setContactEdits((prev) => ({ ...prev, notes: v }))}
                      />
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={contactEdits.engagementScrapeEnabled || false}
                            onChange={(e) =>
                              setContactEdits((prev) => ({ ...prev, engagementScrapeEnabled: e.target.checked }))
                            }
                            className="rounded"
                          />
                          Enable engagement scraping
                        </label>
                        <button onClick={handleSaveContact} disabled={savingContact} className="btn-primary text-sm">
                          {savingContact ? "Saving..." : "Save Contact"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-(--muted) uppercase tracking-wide">
            Pending Actions ({loadingActions ? "..." : actions.length})
          </h3>
          {loadingActions ? (
            <p className="text-sm text-(--muted)">Loading...</p>
          ) : (
            <>
              {actions.length === 0 && <p className="text-sm text-(--muted) mb-3">No pending actions</p>}
              <div className="space-y-2 mb-3">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-2 py-2 px-3 rounded bg-(--input) border border-(--border)"
                  >
                    <span className="text-sm flex-1 truncate">{action.title}</span>
                    {action.dueDate && (
                      <span className={`text-xs ${dueDateStyle(action.dueDate)} whitespace-nowrap`}>
                        Due {relativeDate(action.dueDate)}
                      </span>
                    )}
                    <span className="badge badge-pending">{action.status}</span>
                    <button
                      onClick={() => handleCompleteAction(action.id)}
                      className="text-xs text-(--success) hover:underline shrink-0"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => handleDeleteAction(action.id)}
                      className="text-xs text-(--destructive) hover:underline shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
                <input
                  type="text"
                  value={newActionTitle}
                  onChange={(e) => setNewActionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAction()}
                  placeholder="Add an action..."
                  className="min-w-0"
                />
                <input
                  type="date"
                  value={newActionDueDate}
                  onChange={(e) => setNewActionDueDate(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAction()}
                  className="text-sm min-w-0 max-w-full"
                  title="Due date (optional)"
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

      {/* Editable fields — only shown in edit mode */}
      {editMode && (
        <div className="border-t border-(--border) pt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-(--muted) mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="Account name"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">Industry</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => {
                  setIndustry(e.target.value);
                  setDirty(true);
                }}
                placeholder="e.g. SaaS, Healthcare"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => {
                  setWebsite(e.target.value);
                  setDirty(true);
                }}
                placeholder="https://example.com"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  setDirty(true);
                }}
                placeholder="https://linkedin.com/company/..."
                className="w-full text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <NotesField
                value={notes}
                onChange={(v) => {
                  setNotes(v);
                  setDirty(true);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-(--muted) mb-1">Owner</label>
                <select
                  value={ownerId}
                  onChange={(e) => {
                    setOwnerId(e.target.value);
                    setDirty(true);
                  }}
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
                      setMrrCurrency(mrrCurrency === "$" ? "£" : "$");
                      setDirty(true);
                    }}
                    className="shrink-0 w-8 text-center border border-r-0 border-(--border) rounded-l bg-(--input) text-sm hover:bg-(--border) transition-colors"
                    title="Click to toggle currency"
                  >
                    {mrrCurrency}
                  </button>
                  <input
                    type="number"
                    value={mrr}
                    onChange={(e) => {
                      setMrr(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="rounded-l-none flex-1 min-w-0"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-(--muted) mb-1">Content Voice Guidance</label>
              <textarea
                value={contentVoiceGuidance}
                onChange={(e) => {
                  setContentVoiceGuidance(e.target.value);
                  setDirty(true);
                }}
                placeholder="Default instructions for generated LinkedIn posts for this account."
                rows={3}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">Engagement Slack Channel</label>
              <input
                type="text"
                value={engagementSlackChannel}
                onChange={(e) => {
                  setEngagementSlackChannel(e.target.value);
                  setDirty(true);
                }}
                placeholder="#channel-name"
                className="w-full text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={engagementScrapeEnabled}
              onChange={(e) => {
                setEngagementScrapeEnabled(e.target.checked);
                setDirty(true);
              }}
              className="rounded"
            />
            Enable engagement scraping for this account
          </label>
          {dirty && (
            <div className="mt-3 flex justify-end">
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccountsContent() {
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = showHidden ? "?includeHidden=true" : "";
      const [acctData, userData] = await Promise.all([
        apiFetch(`/api/accounts${params}`, getAccountsResponseSchema),
        apiFetch("/api/admin/users", getUsersResponseSchema),
      ]);
      setAccounts(acctData.accounts);
      setUsers(userData.users);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSave = (updated: AccountListItem) => {
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const handleToggleHidden = async (account: AccountListItem) => {
    const newHidden = !account.hidden;
    try {
      await apiMutate(`/api/accounts/${account.id}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { hidden: newHidden },
      });
      if (!showHidden && newHidden) {
        setAccounts((prev) => prev.filter((a) => a.id !== account.id));
        if (expandedId === account.id) setExpandedId(null);
      } else {
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, hidden: newHidden } : a)));
      }
    } catch {
      // ignore
    }
  };

  const visibleCount = accounts.filter((a) => !a.hidden).length;
  const hiddenCount = accounts.filter((a) => a.hidden).length;

  // Sum MRR by currency (only visible accounts)
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
          {editMode && (
            <label className="flex items-center gap-2 text-sm text-(--muted) cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
                className="w-4 h-auto"
              />
              Show hidden ({hiddenCount})
            </label>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={editMode ? "btn-primary text-sm" : "btn-secondary text-sm"}
          >
            {editMode ? "Done Editing" : "Edit"}
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
              {editMode && <th className="px-3 py-2 font-medium w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={editMode ? 7 : 6} className="py-8 text-center text-(--muted)">
                  Loading...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={editMode ? 7 : 6} className="py-8 text-center text-(--muted)">
                  No accounts found
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <React.Fragment key={account.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === account.id ? null : account.id)}
                    className={`border-b border-(--border) cursor-pointer transition-colors hover:bg-(--input) ${
                      expandedId === account.id ? "bg-(--input)" : ""
                    } ${account.hidden ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <div className="font-medium flex items-center gap-1.5">
                        {account.name}
                        {account.autoCreated && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none"
                            title="Auto-created from calendar sync — review details"
                          >
                            Auto
                          </span>
                        )}
                        {account.engagementScrapeEnabled && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none"
                            title="Engagement scraping enabled"
                          >
                            Scrape
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
                    {editMode && (
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleHidden(account);
                          }}
                          className={`text-xs hover:underline ${account.hidden ? "text-(--success)" : "text-(--muted)"}`}
                        >
                          {account.hidden ? "Show" : "Hide"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedId === account.id && (
                    <tr>
                      <td colSpan={editMode ? 7 : 6} className="border-b border-(--border) bg-(--card)">
                        <ExpandedView account={account} users={users} editMode={editMode} onSave={handleSave} />
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
    <Suspense fallback={<div className="text-(--muted)">Loading...</div>}>
      <AccountsContent />
    </Suspense>
  );
}
