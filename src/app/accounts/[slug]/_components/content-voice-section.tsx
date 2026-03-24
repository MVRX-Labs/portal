"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiMutate } from "@/lib/api-client";
import { updateAccountResponseSchema } from "@/lib/api-schemas/accounts";
import { NotesField } from "@/components/notes-field";
import { SectionCard } from "./section-card";

type ContractLink = { url: string; label: string };

export function ContentVoiceSection({
  accountId,
  initialVoice,
  initialNotes,
  initialCalendarUrl,
  initialContractLinks,
  onSaved,
}: {
  accountId: string;
  initialVoice: string | null;
  initialNotes: string | null;
  initialCalendarUrl: string | null;
  initialContractLinks: ContractLink[] | null;
  onSaved: (fields: Record<string, unknown>) => void;
}) {
  const [voice, setVoice] = useState(initialVoice || "");
  const [notes, setNotes] = useState(initialNotes || "");
  const [calendarUrl, setCalendarUrl] = useState(initialCalendarUrl || "");
  const [contractLinks, setContractLinks] = useState<ContractLink[]>(initialContractLinks || []);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const voiceRef = useRef(initialVoice || "");
  const notesRef = useRef(initialNotes || "");
  const calendarUrlRef = useRef(initialCalendarUrl || "");

  useEffect(() => {
    setVoice(initialVoice || "");
    setNotes(initialNotes || "");
    setCalendarUrl(initialCalendarUrl || "");
    setContractLinks(initialContractLinks || []);
    voiceRef.current = initialVoice || "";
    notesRef.current = initialNotes || "";
    calendarUrlRef.current = initialCalendarUrl || "";
  }, [initialVoice, initialNotes, initialCalendarUrl, initialContractLinks]);

  const saveField = async (field: string, value: unknown) => {
    try {
      await apiMutate(`/api/accounts/${accountId}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { [field]: value ?? null },
      });
      onSaved({ [field]: value ?? null });
      if (field === "contentVoiceGuidance") voiceRef.current = value as string;
      if (field === "notes") notesRef.current = value as string;
      if (field === "contentCalendarUrl") calendarUrlRef.current = value as string;
    } catch {
      if (field === "contentVoiceGuidance") setVoice(voiceRef.current);
      if (field === "notes") setNotes(notesRef.current);
      if (field === "contentCalendarUrl") setCalendarUrl(calendarUrlRef.current);
      if (field === "contractLinks") setContractLinks(initialContractLinks || []);
    }
  };

  const saveContractLinks = async (links: ContractLink[]) => {
    setContractLinks(links);
    await saveField("contractLinks", links.length > 0 ? links : null);
  };

  const addLink = async () => {
    if (!newLinkUrl.trim()) return;
    const link: ContractLink = {
      url: newLinkUrl.trim(),
      label: newLinkLabel.trim() || newLinkUrl.trim(),
    };
    const updated = [...contractLinks, link];
    setNewLinkUrl("");
    setNewLinkLabel("");
    await saveContractLinks(updated);
  };

  const removeLink = async (index: number) => {
    const updated = contractLinks.filter((_, i) => i !== index);
    await saveContractLinks(updated);
  };

  return (
    <SectionCard title="Content & Voice">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-(--muted) mb-1">Content Calendar</label>
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={calendarUrl}
              onChange={(e) => setCalendarUrl(e.target.value)}
              onBlur={() => {
                if (calendarUrl !== calendarUrlRef.current) saveField("contentCalendarUrl", calendarUrl || null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && calendarUrl !== calendarUrlRef.current)
                  saveField("contentCalendarUrl", calendarUrl || null);
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="flex-1 text-sm"
            />
            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-(--accent) hover:underline shrink-0"
              >
                Open
              </a>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-(--muted) mb-1">Contract Detail Links</label>
          {contractLinks.length > 0 && (
            <div className="space-y-1 mb-2">
              {contractLinks.map((link, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-(--input) border border-(--border)"
                >
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-(--accent) hover:underline truncate flex-1 min-w-0"
                  >
                    {link.label}
                  </a>
                  <button onClick={() => removeLink(i)} className="text-(--destructive) hover:underline shrink-0 ml-2">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              placeholder="Label (e.g. SLA)"
              className="w-28 text-xs"
            />
            <input
              type="url"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
              placeholder="https://..."
              className="w-28 text-xs"
            />
            <button onClick={addLink} disabled={!newLinkUrl.trim()} className="btn-primary text-xs px-2">
              Add
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-(--muted) mb-1">Content Voice Guidance</label>
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            onBlur={() => {
              if (voice !== voiceRef.current) saveField("contentVoiceGuidance", voice || null);
            }}
            placeholder="Default instructions for generated LinkedIn posts for this account."
            rows={4}
            className="w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-(--muted) mb-1">Notes</label>
          <NotesField
            value={notes}
            onChange={(v) => setNotes(v)}
            onBlur={() => {
              if (notes !== notesRef.current) saveField("notes", notes || null);
            }}
          />
        </div>
      </div>
    </SectionCard>
  );
}
