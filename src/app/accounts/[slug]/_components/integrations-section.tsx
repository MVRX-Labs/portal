"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Account } from "@/lib/api-schemas/accounts";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { updateAccountResponseSchema } from "@/lib/api-schemas/accounts";
import { SectionCard } from "./section-card";
import { z } from "zod";

const knowledgeChannelsResponseSchema = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      slackChannelName: z.string(),
      channelCategory: z.string(),
      active: z.boolean(),
      lastSyncedAt: z.string().nullable(),
      messagesIngested: z.number().nullable(),
    })
  ),
});

type KnowledgeChannel = z.infer<typeof knowledgeChannelsResponseSchema>["channels"][number];

export function IntegrationsSection({
  account,
  onAccountUpdated,
}: {
  account: Account;
  onAccountUpdated: (a: Partial<Account>) => void;
}) {
  const [engagementChannel, setEngagementChannel] = useState(account.engagementSlackChannel || "");
  const [analyticsChannel, setAnalyticsChannel] = useState(account.analyticsSlackChannel || "");
  const [knowledgeChannels, setKnowledgeChannels] = useState<KnowledgeChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);

  useEffect(() => {
    setEngagementChannel(account.engagementSlackChannel || "");
    setAnalyticsChannel(account.analyticsSlackChannel || "");
  }, [account.engagementSlackChannel, account.analyticsSlackChannel]);

  const fetchKnowledgeChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const data = await apiFetch(`/api/accounts/${account.id}/knowledge-channels`, knowledgeChannelsResponseSchema);
      setKnowledgeChannels(data.channels);
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  }, [account.id]);

  useEffect(() => {
    fetchKnowledgeChannels();
  }, [fetchKnowledgeChannels]);

  const saveField = async (field: string, value: string) => {
    try {
      await apiMutate(`/api/accounts/${account.id}`, updateAccountResponseSchema, {
        method: "PUT",
        body: { [field]: value || null },
      });
      onAccountUpdated({ [field]: value || null });
    } catch {
      // revert on error
      if (field === "engagementSlackChannel") setEngagementChannel(account.engagementSlackChannel || "");
      if (field === "analyticsSlackChannel") setAnalyticsChannel(account.analyticsSlackChannel || "");
    }
  };

  const driveUrl = account.googleDriveFolderId
    ? `https://drive.google.com/drive/folders/${account.googleDriveFolderId}`
    : null;

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      client_shared: "Shared",
      client_internal: "Internal",
      general: "General",
      product: "Product",
      ops: "Ops",
    };
    return labels[cat] || cat;
  };

  return (
    <SectionCard title="Integrations">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-(--muted) mb-1">Engagement Slack Channel</label>
          <input
            type="text"
            value={engagementChannel}
            onChange={(e) => setEngagementChannel(e.target.value)}
            onBlur={() => saveField("engagementSlackChannel", engagementChannel)}
            onKeyDown={(e) => e.key === "Enter" && saveField("engagementSlackChannel", engagementChannel)}
            placeholder="#channel-name"
            className="w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-(--muted) mb-1">Analytics Slack Channel</label>
          <input
            type="text"
            value={analyticsChannel}
            onChange={(e) => setAnalyticsChannel(e.target.value)}
            onBlur={() => saveField("analyticsSlackChannel", analyticsChannel)}
            onKeyDown={(e) => e.key === "Enter" && saveField("analyticsSlackChannel", analyticsChannel)}
            placeholder="#channel-name"
            className="w-full text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-xs text-(--muted) mb-1">Google Drive Folder</label>
          {driveUrl ? (
            <a href={driveUrl} target="_blank" rel="noreferrer" className="text-sm text-(--accent) hover:underline">
              Open folder
            </a>
          ) : (
            <span className="text-sm text-(--muted) italic">Not set up</span>
          )}
        </div>
        <div>
          <label className="block text-xs text-(--muted) mb-1">Knowledge Hub Channels</label>
          {loadingChannels ? (
            <p className="text-sm text-(--muted)">Loading...</p>
          ) : knowledgeChannels.length === 0 ? (
            <p className="text-sm text-(--muted) italic">No channels linked</p>
          ) : (
            <div className="space-y-1">
              {knowledgeChannels.map((ch) => (
                <div
                  key={ch.id}
                  className={`flex items-center justify-between text-xs py-1 px-2 rounded bg-(--input) border border-(--border) ${!ch.active ? "opacity-50" : ""}`}
                >
                  <span className="font-medium">#{ch.slackChannelName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-(--muted)">{categoryLabel(ch.channelCategory)}</span>
                    {ch.messagesIngested != null && <span className="text-(--muted)">{ch.messagesIngested} msgs</span>}
                    <span className={`badge ${ch.active ? "badge-completed" : "badge-neutral"}`}>
                      {ch.active ? "Active" : "Paused"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
