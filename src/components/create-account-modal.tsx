"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { createAccountResponseSchema } from "@/lib/api-schemas/accounts";
import type { AccountListItem } from "@/lib/api-schemas/accounts";
import { apiMutate } from "@/lib/api-client";

interface CreateAccountModalProps {
  defaultName?: string;
  onCreated: (account: AccountListItem) => void;
  onClose: () => void;
}

export function CreateAccountModal({ defaultName, onCreated, onClose }: CreateAccountModalProps) {
  const [name, setName] = useState(defaultName || "");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return;

    setCreating(true);
    setError("");

    try {
      const data = await apiMutate("/api/accounts", createAccountResponseSchema, {
        method: "POST",
        body: {
          name: name.trim(),
          industry: industry.trim() || undefined,
          website: website.trim() || undefined,
          linkedinUrl: linkedinUrl.trim() || undefined,
        },
      });
      onCreated({
        ...data.account,
        ownerName: null,
        contactCount: 0,
        pendingActionCount: 0,
        autoCreated: false,
        hidden: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-(--card) border border-(--border) rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4">Create Account</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Name <span className="text-(--destructive)">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Account name"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. SaaS, Healthcare"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">LinkedIn URL</label>
            <input
              type="text"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/company/..."
            />
          </div>

          {error && <div className="text-sm text-(--destructive)">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="btn-primary flex-1">
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
