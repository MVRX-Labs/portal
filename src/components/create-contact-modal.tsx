"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Contact } from "./account-provider";

interface CreateContactModalProps {
  accountId: string;
  onCreated: (contact: Contact) => void;
  onClose: () => void;
}

export function CreateContactModal({
  accountId,
  onCreated,
  onClose,
}: CreateContactModalProps) {
  const [name, setName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
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
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          accountId,
          accountEmail: accountEmail.trim() || null,
          personalEmail: personalEmail.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create contact");
      }

      onCreated(data.contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setCreating(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4">Create Contact</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Name <span className="text-[var(--destructive)]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Work Email
            </label>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="work@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Personal Email
            </label>
            <input
              type="email"
              value={personalEmail}
              onChange={(e) => setPersonalEmail(e.target.value)}
              placeholder="personal@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              LinkedIn URL
            </label>
            <input
              type="text"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username"
            />
          </div>

          {error && (
            <div className="text-sm text-[var(--destructive)]">{error}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary flex-1"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
