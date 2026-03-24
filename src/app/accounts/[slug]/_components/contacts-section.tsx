"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Contact } from "@/lib/api-schemas/contacts";
import { apiFetch, apiMutate } from "@/lib/api-client";
import {
  getAccountContactsResponseSchema,
  updateContactResponseSchema,
  deleteContactResponseSchema,
} from "@/lib/api-schemas/contacts";
import { NotesField } from "@/components/notes-field";
import { CreateContactModal } from "@/components/create-contact-modal";
import { SectionCard } from "./section-card";

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

export function ContactsSection({ accountId }: { accountId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Partial<Contact>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${accountId}/contacts`, getAccountContactsResponseSchema);
      setContacts(data.contacts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setEdits({
      name: contact.name,
      accountEmail: contact.accountEmail,
      personalEmail: contact.personalEmail,
      linkedinUrl: contact.linkedinUrl,
      contentVoiceGuidance: contact.contentVoiceGuidance,
      notes: contact.notes,
    });
  };

  const saveContact = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await apiMutate(`/api/contacts/${editingId}`, updateContactResponseSchema, {
        method: "PUT",
        body: {
          name: edits.name,
          accountEmail: edits.accountEmail || null,
          personalEmail: edits.personalEmail || null,
          linkedinUrl: edits.linkedinUrl || null,
          contentVoiceGuidance: edits.contentVoiceGuidance || null,
          notes: edits.notes || null,
        },
      });
      setContacts((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...edits } : c)));
      setEditingId(null);
      setEdits({});
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    setDeleting(true);
    try {
      await apiMutate(`/api/contacts/${contactId}`, deleteContactResponseSchema, {
        method: "DELETE",
      });
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setConfirmDeleteId(null);
      if (editingId === contactId) {
        setEditingId(null);
        setEdits({});
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SectionCard
      title="Contacts"
      count={loading ? "..." : contacts.length}
      action={
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCreate(true);
          }}
          className="text-xs text-(--muted) hover:text-(--foreground) hover:underline"
        >
          + Add Contact
        </button>
      }
    >
      {loading ? (
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none">
                        Auto
                      </span>
                    )}
                  </p>
                  {contact.accountEmail && <p className="text-xs text-(--muted) truncate">{contact.accountEmail}</p>}
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
                  <button
                    onClick={() => (editingId === contact.id ? setEditingId(null) : startEdit(contact))}
                    className="text-xs text-(--muted) hover:underline"
                  >
                    {editingId === contact.id ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>
              {editingId === contact.id && (
                <div className="mt-1 p-3 rounded bg-(--card) border border-(--border) space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-(--muted) mb-1">Name</label>
                      <input
                        type="text"
                        value={edits.name || ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-(--muted) mb-1">LinkedIn URL</label>
                      <input
                        type="text"
                        value={edits.linkedinUrl || ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
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
                        value={edits.accountEmail || ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, accountEmail: e.target.value }))}
                        className="w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-(--muted) mb-1">Personal Email</label>
                      <input
                        type="email"
                        value={edits.personalEmail || ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, personalEmail: e.target.value }))}
                        className="w-full text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-(--muted) mb-1">Content Voice Guidance</label>
                    <textarea
                      value={edits.contentVoiceGuidance || ""}
                      onChange={(e) => setEdits((prev) => ({ ...prev, contentVoiceGuidance: e.target.value }))}
                      placeholder="e.g. US spelling. No abbreviations. Avoid vague claims."
                      rows={3}
                      className="w-full text-sm"
                    />
                  </div>
                  <NotesField value={edits.notes || ""} onChange={(v) => setEdits((prev) => ({ ...prev, notes: v }))} />
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      {confirmDeleteId === contact.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Are you sure?</span>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            disabled={deleting}
                            className="text-xs text-red-400 hover:text-red-300 font-medium hover:underline"
                          >
                            {deleting ? "Deleting..." : "Yes, remove"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-(--muted) hover:underline"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(contact.id)}
                          className="text-xs text-red-400/70 hover:text-red-400 hover:underline"
                        >
                          Remove contact
                        </button>
                      )}
                    </div>
                    <button onClick={saveContact} disabled={saving} className="btn-primary text-sm">
                      {saving ? "Saving..." : "Save Contact"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateContactModal
          accountId={accountId}
          onCreated={() => {
            setShowCreate(false);
            fetchContacts();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </SectionCard>
  );
}
