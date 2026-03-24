"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "./section-card";
import { z } from "zod";

const knowledgeStateResponseSchema = z.object({
  docs: z.array(
    z.object({
      stateType: z.string(),
      content: z.string(),
      version: z.number(),
      updatedAt: z.coerce.date(),
    })
  ),
});

type StateDoc = z.infer<typeof knowledgeStateResponseSchema>["docs"][number];

const stateTypeLabels: Record<string, string> = {
  brief: "Brief",
  open_items: "Open Items",
  activity_log: "Activity Log",
};

const stateTypeOrder = ["brief", "open_items", "activity_log"];

export function KnowledgeStateSection({ accountId }: { accountId: string }) {
  const [docs, setDocs] = useState<StateDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${accountId}/knowledge-state`, knowledgeStateResponseSchema);
      setDocs(data.docs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (!loading && docs.length === 0) return null;

  const sorted = [...docs].sort((a, b) => stateTypeOrder.indexOf(a.stateType) - stateTypeOrder.indexOf(b.stateType));

  return (
    <SectionCard title="Knowledge State" collapsible defaultOpen={false}>
      {loading ? (
        <p className="text-sm text-(--muted)">Loading...</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((doc) => (
            <div key={doc.stateType} className="rounded bg-(--input) border border-(--border)">
              <button
                onClick={() => setExpandedType(expandedType === doc.stateType ? null : doc.stateType)}
                className="w-full flex items-center justify-between py-2 px-3 text-left"
              >
                <span className="text-sm font-medium">
                  {stateTypeLabels[doc.stateType] || doc.stateType}
                  <span className="text-xs text-(--muted) ml-2">v{doc.version}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-(--muted)">{doc.updatedAt.toLocaleDateString()}</span>
                  <span className="text-xs text-(--muted)">{expandedType === doc.stateType ? "\u25BC" : "\u25B6"}</span>
                </div>
              </button>
              {expandedType === doc.stateType && (
                <div className="px-3 pb-3">
                  <pre className="whitespace-pre-wrap text-xs text-(--foreground) bg-(--card) rounded p-3 max-h-96 overflow-y-auto">
                    {doc.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
