"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount } from "@/components/account-provider";
import { apiFetch, apiMutate } from "@/lib/api-client";
import {
  getChannelsResponseSchema,
  getStatsResponseSchema,
  getStateResponseSchema,
  triggerSyncResponseSchema,
  patchChannelResponseSchema,
  type Channel,
  type KnowledgeStats,
  type StateDoc,
} from "@/lib/api-schemas/knowledge";

export default function KnowledgeHubPage() {
  const { account } = useAccount();
  const searchParams = useSearchParams();
  const qs = searchParams.get("account") ? `?account=${searchParams.get("account")}` : "";

  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [docs, setDocs] = useState<StateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!account) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [channelsRes, statsRes] = await Promise.all([
        apiFetch("/api/knowledge/channels", getChannelsResponseSchema),
        apiFetch("/api/knowledge/stats", getStatsResponseSchema),
      ]);
      // Filter channels to the selected account
      setChannels(channelsRes.channels.filter((c) => c.accountId === account.id));
      setStats(statsRes.stats);

      // Load state docs for the selected account
      try {
        const stateRes = await apiFetch(`/api/knowledge/state?accountId=${account.id}`, getStateResponseSchema);
        setDocs(stateRes.docs);
      } catch {
        setDocs([]);
      }
    } catch {
      // errors handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleActive = async (channel: Channel) => {
    try {
      await apiMutate(`/api/knowledge/channels/${channel.id}`, patchChannelResponseSchema, {
        method: "PATCH",
        body: { active: !channel.active },
      });
      loadData();
    } catch {
      // handled by toast
    }
  };

  const handleTriggerSync = async (channelId: string) => {
    try {
      await apiMutate(`/api/knowledge/channels/${channelId}/sync`, triggerSyncResponseSchema, {
        method: "POST",
      });
    } catch {
      // handled by toast
    }
  };

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "Never";
    return new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Knowledge Hub</h1>
        <p className="text-(--muted)">Select an account to view knowledge data.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Knowledge Hub</h1>
        <p className="text-(--muted)">Loading...</p>
      </div>
    );
  }

  const brief = docs.find((d) => d.stateType === "brief");
  const openItems = docs.find((d) => d.stateType === "open_items");
  const openCount = openItems ? (openItems.content.match(/- \[ \]/g) || []).length : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Hub</h1>
          <p className="text-sm text-(--muted)">
            {account.name} — Slack ingestion, knowledge extraction, and account state synthesis.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/org/knowledge/units${qs}`} className="btn-secondary text-sm">
            Browse Units
          </Link>
          <Link href={`/org/knowledge/state${qs}`} className="btn-secondary text-sm">
            Account State
          </Link>
        </div>
      </div>

      {/* Pipeline Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card">
            <p className="text-xs text-(--muted) mb-1">Total Events</p>
            <p className="text-2xl font-bold">{stats.totalEvents.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="text-xs text-(--muted) mb-1">Total Units</p>
            <p className="text-2xl font-bold">{stats.totalUnits.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="text-xs text-(--muted) mb-1">Open Units</p>
            <p className="text-2xl font-bold text-(--warning)">{stats.openUnits.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="text-xs text-(--muted) mb-1">Done Units</p>
            <p className="text-2xl font-bold text-(--success)">{stats.doneUnits.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Pipeline Timestamps */}
      {stats && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold mb-3">Pipeline Status</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-(--muted) text-xs">Last Ingestion</p>
              <p>{fmtDate(stats.lastIngestAt)}</p>
            </div>
            <div>
              <p className="text-(--muted) text-xs">Last Normalisation</p>
              <p>{fmtDate(stats.lastNormaliseAt)}</p>
            </div>
            <div>
              <p className="text-(--muted) text-xs">Last Digest</p>
              <p>{fmtDate(stats.lastDigestAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Account State Summary */}
      {brief && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Executive Brief</h2>
            <div className="flex items-center gap-3">
              {openCount > 0 && <span className="text-xs text-(--warning)">{openCount} open items</span>}
              <span className="text-xs text-(--muted)">{fmtDate(brief.updatedAt)}</span>
            </div>
          </div>
          <p className="text-sm text-(--muted) leading-relaxed">
            {brief.content.slice(0, 300)}
            {brief.content.length > 300 ? "..." : ""}
          </p>
          <Link href={`/org/knowledge/state${qs}`} className="text-xs text-(--accent) mt-2 inline-block">
            View full state →
          </Link>
        </div>
      )}

      {/* Channels */}
      <div className="card mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Channels</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border) text-left text-(--muted)">
              <th className="pb-2 pr-4 font-medium">Channel</th>
              <th className="pb-2 pr-4 font-medium">Category</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Last Sync</th>
              <th className="pb-2 pr-4 font-medium">Messages</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-(--muted)">
                  No channels registered for this account
                </td>
              </tr>
            ) : (
              channels.map((ch) => (
                <tr key={ch.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">#{ch.slackChannelName}</td>
                  <td className="py-2 pr-4">
                    <span className="badge badge-neutral text-xs">{ch.channelCategory}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`badge ${ch.active ? "badge-completed" : "badge-failed"}`}>
                      {ch.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-(--muted) text-xs">{fmtDate(ch.lastSyncedAt)}</td>
                  <td className="py-2 pr-4">{ch.messagesIngested ?? 0}</td>
                  <td className="py-2 whitespace-nowrap">
                    <button onClick={() => handleToggleActive(ch)} className="btn-secondary text-xs mr-1">
                      {ch.active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => handleTriggerSync(ch.id)} className="btn-primary text-xs">
                      Sync
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
