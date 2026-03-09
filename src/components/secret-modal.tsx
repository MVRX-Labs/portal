"use client";

import { useEffect, useState } from "react";
import type { Secret, SecretType } from "@/lib/api-schemas/secrets";
import type { AccountListItem } from "@/lib/api-schemas/accounts";
import type { Contact } from "@/lib/api-schemas/contacts";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { getAccountContactsResponseSchema } from "@/lib/api-schemas/contacts";
import { createSecretTypeResponseSchema } from "@/lib/api-schemas/secrets";

interface SecretModalProps {
  editing: Secret | null;
  accounts: AccountListItem[];
  secretTypes: SecretType[];
  onClose: () => void;
  onSaved: () => void;
  onTypeCreated: () => void;
}

export function SecretModal({ editing, accounts, secretTypes, onClose, onSaved, onTypeCreated }: SecretModalProps) {
  const [accountId, setAccountId] = useState(editing?.accountId || "");
  const [contactId, setContactId] = useState(editing?.contactId || "");
  const [typeId, setTypeId] = useState(editing?.typeId || "");
  const [name, setName] = useState(editing?.name || "");
  const [value, setValue] = useState(editing?.value || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setContacts([]);
      setContactId("");
      return;
    }
    setLoadingContacts(true);
    apiFetch(`/api/accounts/${accountId}/contacts`, getAccountContactsResponseSchema)
      .then((data) => setContacts(data.contacts))
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [accountId]);

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const res = await apiMutate("/api/admin/secret-types", createSecretTypeResponseSchema, {
        method: "POST",
        body: { name: newTypeName.trim() },
      });
      setTypeId(res.secretType.id);
      setNewTypeName("");
      setCreatingType(false);
      onTypeCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create type");
    }
  };

  const handleSave = async () => {
    setError("");
    if (!accountId || !typeId || !name || !value) {
      setError("Account, type, name, and value are required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        accountId,
        contactId: contactId || null,
        typeId,
        name,
        value,
        description: description || undefined,
      };
      if (editing) {
        await apiMutate(`/api/admin/secrets/${editing.id}`, { parse: (v: unknown) => v } as never, {
          method: "PUT",
          body,
        });
      } else {
        await apiMutate("/api/admin/secrets", { parse: (v: unknown) => v } as never, {
          method: "POST",
          body,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg">
        <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Secret" : "Add Secret"}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Account *</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!!editing}>
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact (optional)</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={!accountId || loadingContacts}
            >
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type *</label>
            {creatingType ? (
              <div className="flex gap-2">
                <input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateType()}
                  placeholder="New type name..."
                  className="flex-1"
                  autoFocus
                />
                <button onClick={handleCreateType} className="btn-primary text-sm">
                  Create
                </button>
                <button onClick={() => setCreatingType(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="flex-1">
                  <option value="">Select type...</option>
                  {secretTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => setCreatingType(true)} className="btn-secondary text-sm whitespace-nowrap">
                  New Type
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LinkedIn password" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Value *</label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Secret value"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context..."
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-(--destructive)">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? "Saving..." : editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
