"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, apiMutate } from "@/lib/api-client";
import {
  getChannelsResponseSchema,
  getStateResponseSchema,
  triggerSynthesisResponseSchema,
  type Channel,
  type StateDoc,
} from "@/lib/api-schemas/knowledge";

export default function AccountStatePage() {
  const searchParams = useSearchParams();
  const preselectedAccountId = searchParams.get("accountId") ?? "";

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(preselectedAccountId);
  const [docs, setDocs] = useState<StateDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Extract unique accounts from channels
  const accountOptions = [...new Map(
    channels.filter((c) => c.accountId).map((c) => [c.accountId, c.slackChannelName.replace(/^ext-/, "").replace(/-/g, " ")])
  ).entries()].map(([id, name]) => ({ id: id!, name }));

  const loadChannels = useCallback(async () => {
    try {
      const res = await apiFetch("/api/knowledge/channels", getChannelsResponseSchema);
      setChannels(res.channels);
    } catch {
      // handled by toast
    }
  }, []);

  const loadState = useCallback(async () => {
    if (!selectedAccountId) {
      setDocs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/knowledge/state?accountId=${selectedAccountId}`, getStateResponseSchema);
      setDocs(res.docs);
    } catch {
      // handled by toast
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);
  useEffect(() => { loadState(); }, [loadState]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await apiMutate("/api/knowledge/state/synthesise", triggerSynthesisResponseSchema, {
        method: "POST",
        body: { accountId: selectedAccountId || undefined },
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Account State</h1>
          <p className="text-sm text-(--muted)">
            Living state documents synthesised from knowledge units.
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="btn-primary"
        >
          {regenerating ? "Triggering..." : "Regenerate"}
        </button>
      </div>

      {/* Account selector */}
      <div className="card mb-6">
        <label className="block text-xs text-(--muted) mb-1">Select Account</label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
        >
          <option value="">Choose an account...</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-(--muted)">Loading state documents...</p>}

      {!loading && selectedAccountId && docs.length === 0 && (
        <p className="text-(--muted)">No state documents generated for this account yet. Click &quot;Regenerate&quot; to synthesise.</p>
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
