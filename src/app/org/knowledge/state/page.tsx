"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { getStateResponseSchema, triggerSynthesisResponseSchema, type StateDoc } from "@/lib/api-schemas/knowledge";

export default function AccountStatePage() {
  const { account } = useAccount();

  const [docs, setDocs] = useState<StateDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const loadState = useCallback(async () => {
    if (!account) {
      setDocs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/knowledge/state?accountId=${account.id}`, getStateResponseSchema);
      setDocs(res.docs);
    } catch {
      // handled by toast
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleRegenerate = async () => {
    if (!account) return;
    setRegenerating(true);
    try {
      await apiMutate("/api/knowledge/state/synthesise", triggerSynthesisResponseSchema, {
        method: "POST",
        body: { accountId: account.id },
      });
    } catch {
      // handled by toast
    } finally {
      setRegenerating(false);
    }
  };

  const getDoc = (type: string) => docs.find((d) => d.stateType === type);
  const fmtDate = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

  const brief = getDoc("brief");
  const openItems = getDoc("open_items");
  const activityLog = getDoc("activity_log");

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Account State</h1>
        <p className="text-(--muted)">Select an account to view state documents.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Account State</h1>
          <p className="text-sm text-(--muted)">
            {account.name} — Living state documents synthesised from knowledge units.
          </p>
        </div>
        <button onClick={handleRegenerate} disabled={regenerating} className="btn-primary">
          {regenerating ? "Triggering..." : "Regenerate"}
        </button>
      </div>

      {loading && <p className="text-(--muted)">Loading state documents...</p>}

      {!loading && docs.length === 0 && (
        <p className="text-(--muted)">
          No state documents generated for this account yet. Click &quot;Regenerate&quot; to synthesise.
        </p>
      )}

      {!loading && docs.length > 0 && (
        <div className="space-y-4">
          {/* Brief */}
          {brief && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Executive Brief</h2>
                <div className="flex items-center gap-3 text-xs text-(--muted)">
                  <span>v{brief.version}</span>
                  <span>{fmtDate(brief.updatedAt)}</span>
                </div>
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{brief.content}</div>
            </div>
          )}

          {/* Open Items */}
          {openItems && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Open Items</h2>
                <div className="flex items-center gap-3 text-xs text-(--muted)">
                  <span>v{openItems.version}</span>
                  <span>{fmtDate(openItems.updatedAt)}</span>
                </div>
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed prose-invert">{openItems.content}</div>
            </div>
          )}

          {/* Activity Log */}
          {activityLog && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Activity Log (14 days)</h2>
                <div className="flex items-center gap-3 text-xs text-(--muted)">
                  <span>v{activityLog.version}</span>
                  <span>{fmtDate(activityLog.updatedAt)}</span>
                </div>
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{activityLog.content}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
