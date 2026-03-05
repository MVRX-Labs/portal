"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, type Contact } from "./account-provider";
import { CreateContactModal } from "./create-contact-modal";

interface ContactPickerProps {
  value: string;
  onChange: (contactId: string) => void;
  required?: boolean;
}

export function ContactPicker({ value, onChange, required }: ContactPickerProps) {
  const { account, refreshContacts } = useAccount();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !account) return;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ accountId: account.id });
        if (query) params.set("q", query);
        const res = await fetch(`/api/contacts?${params}`);
        const data = await res.json();
        setResults(data.contacts || []);
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, account]);

  // Fetch selected contact details when value changes
  useEffect(() => {
    if (!value) {
      setSelectedContact(null);
      return;
    }
    // Check if we already have this contact in results
    const found = results.find((c) => c.id === value);
    if (found) {
      setSelectedContact(found);
      return;
    }
    // Otherwise fetch it
    (async () => {
      try {
        const res = await fetch(`/api/contacts?accountId=${account?.id}`);
        const data = await res.json();
        const contact = (data.contacts || []).find((c: Contact) => c.id === value);
        if (contact) setSelectedContact(contact);
      } catch {
        // ignore
      }
    })();
  }, [value, account?.id, results]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (contact: Contact) => {
    setSelectedContact(contact);
    onChange(contact.id);
    setOpen(false);
    setQuery("");
  };

  const handleCreated = async (contact: Contact) => {
    setSelectedContact(contact);
    onChange(contact.id);
    setShowCreate(false);
    setOpen(false);
    await refreshContacts();
  };

  if (!account) {
    return (
      <div className="text-sm text-(--muted) px-2 py-1.5 rounded bg-(--input) border border-(--border)">
        Select an account first
      </div>
    );
  }

  return (
    <>
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full text-left text-sm px-3 py-2 rounded bg-(--input) border border-(--border) hover:border-(--accent) transition-colors"
        >
          {selectedContact ? (
            <div>
              <span className="font-medium">{selectedContact.name}</span>
              {selectedContact.linkedinUrl && (
                <span className="text-(--muted) ml-2 text-xs">{selectedContact.linkedinUrl}</span>
              )}
            </div>
          ) : (
            <span className="text-(--muted)">Select contact...</span>
          )}
        </button>

        {/* Hidden input for form validation */}
        {required && (
          <input
            type="text"
            value={value || ""}
            required
            tabIndex={-1}
            className="absolute inset-0 opacity-0 pointer-events-none"
            onChange={() => {}}
          />
        )}

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-(--card) border border-(--border) rounded-md shadow-lg max-h-56 overflow-auto">
            <div className="p-2 border-b border-(--border)">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full text-xs px-2 py-1"
                autoFocus
              />
            </div>

            {results.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleSelect(contact)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-(--input) transition-colors ${
                  value === contact.id ? "text-(--accent)" : ""
                }`}
              >
                <div className="font-medium">{contact.name}</div>
                {contact.linkedinUrl && <div className="text-xs text-(--muted) truncate">{contact.linkedinUrl}</div>}
              </button>
            ))}

            {results.length === 0 && query && <div className="px-3 py-2 text-xs text-(--muted)">No contacts found</div>}

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full text-left px-3 py-2 text-sm text-(--accent) hover:bg-(--input) transition-colors border-t border-(--border)"
            >
              + Create Contact
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateContactModal accountId={account.id} onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}
