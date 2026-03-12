"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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

const TYPE_EMOJI: Record<string, string> = {
  action_item: "🔹",
  decision: "⚖️",
  request: "📩",
  blocker: "🚫",
  deliverable: "📦",
  feedback: "💬",
  context_update: "📝",
  content_draft: "✍️",
  product_bug: "🐛",
  product_feature: "✨",
};

interface AccountStatePreview {
  accountId: string;
  accountName: string;
  briefSnippet: string;
  openItemCount: number;
  lastUpdated: string | null;
}

export default function KnowledgeHubPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [accountPreviews, setAccountPreviews] = useState<AccountStatePreview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [channelsRes, statsRes] = await Promise.all([
        apiFetch("/api/knowledge/channels", getChannelsResponseSchema),
        apiFetch("/api/knowledge/stats", getStatsResponseSchema),
      ]);
      setChannels(channelsRes.channels);
      setStats(statsRes.stats);

      // Load state previews for accounts with channels
      const accountIds = [...new Set(channelsRes.channels.map((c) => c.accountId).filter(Boolean))] as string[];
      const previews: AccountStatePreview[] = [];

      for (const accountId of accountIds) {
        try {
          const stateRes = await apiFetch(`/api/knowledge/state?accountId=${accountId}`, getStateResponseSchema);
          const brief = stateRes.docs.find((d: StateDoc) => d.stateType === "brief");
          const openItems = stateRes.docs.find((d: StateDoc) => d.stateType === "open_items");
          const channel = channelsRes.channels.find((c) => c.accountId === accountId);

          // Count open items by counting "- [ ]" markers
          const openCount = openItems ? (openItems.content.match(/- \[ \]/g) || []).length : 0;

          previews.push({
            accountId,
            accountName: channel?.slackChannelName?.replace(/^ext-/, "").replace(/-/g, " ") ?? accountId,
            briefSnippet: brief ? brief.content.slice(0, 200) + (brief.content.length > 200 ? "..." : "") : "No brief generated yet",
            openItemCount: openCount,
            lastUpdated: brief?.updatedAt ?? null,
          });
        } catch {
          // Skip accounts with no state
        }
      }
      setAccountPreviews(previews);
    } catch {
      // errors handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Knowledge Hub</h1>
        <p className="text-(--muted)">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Hub</h1>
          <p className="text-sm text-(--muted)">
            Slack ingestion, knowledge extraction, and account state synthesis.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/knowledge/units" className="btn-secondary text-sm">
            Browse Units
          </Link>
          <Link href="/admin/knowledge/state" className="btn-secondary text-sm">
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
                  No channels registered
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
                    <button
                      onClick={() => handleToggleActive(ch)}
                      className="btn-secondary text-xs mr-1"
                    >
                      {ch.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleTriggerSync(ch.id)}
                      className="btn-primary text-xs"
                    >
                      Sync
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Account State Previews */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3">Account State</h2>
        {accountPreviews.length === 0 ? (
          <p className="text-sm text-(--muted)">No account state documents generated yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accountPreviews.map((preview) => (
              <Link
                key={preview.accountId}
                href={`/admin/knowledge/state?accountId=${preview.accountId}`}
                className="card hover:border-(--accent) transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium capitalize">{preview.accountName}</h3>
                  <span className="text-xs text-(--muted)">{fmtDate(preview.lastUpdated)}</span>
                </div>
                <p className="text-sm text-(--muted) mb-2">{preview.briefSnippet}</p>
                <p className="text-xs text-(--warning)">{preview.openItemCount} open items</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
