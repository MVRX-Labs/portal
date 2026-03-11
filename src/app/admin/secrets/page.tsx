"use client";

import { useEffect, useState, useCallback } from "react";
import type { Secret, SecretType } from "@/lib/api-schemas/secrets";
import type { AccountListItem } from "@/lib/api-schemas/accounts";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { getSecretsResponseSchema, getSecretTypesResponseSchema } from "@/lib/api-schemas/secrets";
import { getAccountsResponseSchema } from "@/lib/api-schemas/accounts";
import { SecretModal } from "@/components/secret-modal";

export default function AdminSecretsPage() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [secretTypes, setSecretTypes] = useState<SecretType[]>([]);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAccountId, setFilterAccountId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Secret | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterAccountId ? `?accountId=${filterAccountId}` : "";
      const data = await apiFetch(`/api/admin/secrets${params}`, getSecretsResponseSchema);
      setSecrets(data.secrets);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterAccountId]);

  const loadTypes = async () => {
    try {
      const data = await apiFetch("/api/admin/secret-types", getSecretTypesResponseSchema);
      setSecretTypes(data.secretTypes);
    } catch {
      // ignore
    }
  };

  const loadAccounts = async () => {
    try {
      const data = await apiFetch("/api/accounts?includeHidden=true", getAccountsResponseSchema);
      setAccounts(data.accounts);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadTypes();
    loadAccounts();
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this secret?")) return;
    try {
      await apiMutate(`/api/admin/secrets/${id}`, { parse: (v: unknown) => v } as never, { method: "DELETE" });
      loadSecrets();
    } catch {
      // ignore
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (secret: Secret) => {
    setEditing(secret);
    setShowModal(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Secrets
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none whitespace-nowrap">
              BETA
            </span>
          </h1>
          <p className="text-sm text-(--muted)">Manage account and contact credentials.</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          Add Secret
        </button>
      </div>

      <div className="mb-4">
        <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)} className="w-64">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border) text-left text-(--muted)">
              <th className="pb-2 pr-4 font-medium">Account</th>
              <th className="pb-2 pr-4 font-medium">Contact</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Value</th>
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-(--muted)">
                  Loading...
                </td>
              </tr>
            ) : secrets.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-(--muted)">
                  No secrets found
                </td>
              </tr>
            ) : (
              secrets.map((secret) => (
                <tr key={secret.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2 pr-4">{secret.accountName}</td>
                  <td className="py-2 pr-4 text-(--muted)">{secret.contactName || "\u2014"}</td>
                  <td className="py-2 pr-4">
                    <span className="badge badge-neutral">{secret.typeName}</span>
                  </td>
                  <td className="py-2 pr-4 font-medium">{secret.name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    <span
                      onClick={() => toggleReveal(secret.id)}
                      className="cursor-pointer hover:text-(--foreground) select-all"
                      title="Click to toggle"
                    >
                      {revealedIds.has(secret.id) ? secret.value : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-(--muted) max-w-xs truncate">{secret.description || "\u2014"}</td>
                  <td className="py-2">
                    <button onClick={() => openEdit(secret)} className="btn-secondary mr-2 text-xs">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(secret.id)} className="btn-danger text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <SecretModal
          editing={editing}
          accounts={accounts}
          secretTypes={secretTypes}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            loadSecrets();
          }}
          onTypeCreated={loadTypes}
        />
      )}
    </div>
  );
}
