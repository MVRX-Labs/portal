"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount } from "@/components/account-provider";
import { apiFetch, apiMutate } from "@/lib/api-client";
import type { IcpDefinition } from "@/lib/api-schemas/icp-definitions";
import type { AlphaFeed, AlphaFeedEntry } from "@/lib/api-schemas/alpha-feed";
import { getIcpDefinitionsResponseSchema } from "@/lib/api-schemas/icp-definitions";
import { getAlphaFeedResponseSchema, collectAlphaFeedResponseSchema } from "@/lib/api-schemas/alpha-feed";
import { TriggerRunIndicator } from "@/components/trigger-run-indicator";
import { usePendingRuns } from "@/lib/hooks/use-pending-runs";

function formatPostDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h`;
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

function LinkedInPostCard({ entry }: { entry: AlphaFeedEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.content.length > 300;
  const displayContent = expanded || !isLong ? entry.content : entry.content.slice(0, 300);

  return (
    <div className="rounded-lg border border-(--border) bg-(--card) overflow-hidden">
      {/* Author header */}
      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-(--accent)/20 flex items-center justify-center text-sm font-bold text-(--accent) shrink-0">
          {(entry.authorName || "?")[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {entry.authorLinkedinUrl ? (
            <a
              href={entry.authorLinkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold hover:underline block truncate"
            >
              {entry.authorName}
            </a>
          ) : (
            <span className="text-sm font-semibold block truncate">{entry.authorName}</span>
          )}
          {entry.authorHeadline && <p className="text-xs text-(--muted) truncate">{entry.authorHeadline}</p>}
          <p className="text-xs text-(--muted)">{formatPostDate(entry.postedAt)}</p>
        </div>
      </div>

      {/* Post content */}
      <div className="px-4 pb-3">
        <div className="text-sm whitespace-pre-line leading-relaxed">
          {displayContent}
          {isLong && !expanded && "..."}
        </div>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-(--accent) hover:underline mt-1">
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Engagement bar */}
      <div className="px-4 py-2 border-t border-(--border) flex items-center gap-1 text-xs text-(--muted)">
        <span>{entry.likesCount.toLocaleString()}</span>
        <span>likes</span>
        <span className="mx-1">&middot;</span>
        <span>{entry.commentsCount.toLocaleString()}</span>
        <span>comments</span>
        <span className="mx-1">&middot;</span>
        <span>{entry.repostsCount.toLocaleString()}</span>
        <span>reposts</span>
      </div>

      {/* Action bar */}
      <div className="px-4 py-2 border-t border-(--border) flex items-center justify-between">
        <span className="text-[10px] text-(--muted) px-2 py-0.5 rounded-full bg-(--input)">
          {entry.sourceType === "sage" ? "Sage" : "Keyword"}: {entry.sourceLabel}
        </span>
        <a
          href={entry.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-(--accent) hover:underline font-medium"
        >
          View on LinkedIn &rarr;
        </a>
      </div>
    </div>
  );
}

export default function AlphaFeedPage() {
  const { account } = useAccount();
  const [icpDefs, setIcpDefs] = useState<IcpDefinition[]>([]);
  const [feeds, setFeeds] = useState<Record<string, AlphaFeed | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedIcp, setSelectedIcp] = useState<string | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0); // 0 = most recent
  const collectingRuns = usePendingRuns();

  const fetchData = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const icpData = await apiFetch(`/api/accounts/${account.id}/icp-definitions`, getIcpDefinitionsResponseSchema);
      const activeIcps = icpData.icpDefinitions.filter((d) => d.active);
      setIcpDefs(activeIcps);

      const feedResults = await Promise.all(
        activeIcps.map(async (icp) => {
          try {
            const data = await apiFetch(`/api/accounts/${account.id}/alpha-feed/${icp.id}`, getAlphaFeedResponseSchema);
            return [icp.id, data.alphaFeed] as const;
          } catch {
            return [icp.id, null] as const;
          }
        })
      );

      const feedMap: Record<string, AlphaFeed | null> = {};
      for (const [icpId, feed] of feedResults) {
        feedMap[icpId] = feed;
      }
      setFeeds(feedMap);

      const firstWithFeed = activeIcps.find((icp) => feedMap[icp.id]);
      setSelectedIcp(firstWithFeed?.id ?? activeIcps[0]?.id ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const collectFeed = async (icpId: string) => {
    if (!account) return;
    try {
      const { triggerRunId, publicAccessToken } = await apiMutate(
        `/api/accounts/${account.id}/alpha-feed/${icpId}/collect`,
        collectAlphaFeedResponseSchema,
        { method: "POST", body: {} }
      );
      collectingRuns.set(icpId, triggerRunId, publicAccessToken);
    } catch {
      // toast handled
    }
  };

  if (!account) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold mb-2">LinkedIn Alpha Feed</h1>
        <p className="text-sm text-(--muted)">Select an account to view the alpha feed.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">LinkedIn Alpha Feed</h1>
        <p className="text-sm text-(--muted)">Loading...</p>
      </div>
    );
  }

  if (icpDefs.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">LinkedIn Alpha Feed</h1>
        <p className="text-sm text-(--muted) mb-4">
          No active ICP definitions found. Set up ICP definitions on the account overview page first.
        </p>
        <Link href={`/accounts/${account.slug}`} className="text-(--accent) hover:underline text-sm">
          Go to account overview
        </Link>
      </div>
    );
  }

  const anyFeedConfigured = Object.values(feeds).some(
    (f) => f && ((f.sages?.length ?? 0) > 0 || (f.keywords?.length ?? 0) > 0)
  );

  if (!anyFeedConfigured) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">LinkedIn Alpha Feed</h1>
        <p className="text-sm text-(--muted) mb-4">
          No alpha feed configured yet. Generate a spec or add sages and keywords on the account overview page.
        </p>
        <Link href={`/accounts/${account.slug}`} className="text-(--accent) hover:underline text-sm">
          Go to account overview to configure
        </Link>
      </div>
    );
  }

  const currentFeed = selectedIcp ? feeds[selectedIcp] : null;
  const dailyEntries = currentFeed?.dailyEntries ?? {};
  const dateKeys = Object.keys(dailyEntries).sort().reverse();
  const sages = currentFeed?.sages ?? [];
  const keywords = currentFeed?.keywords ?? [];

  // Current day's entries
  const currentDateKey = dateKeys[selectedDayIdx] ?? null;
  const currentDayEntries = currentDateKey ? (dailyEntries[currentDateKey] ?? []) : [];
  const sagePosts = currentDayEntries.filter((e) => e.sourceType === "sage");
  const keywordPosts = currentDayEntries.filter((e) => e.sourceType === "keyword");

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">LinkedIn Alpha Feed</h1>
        <div className="flex items-center gap-2">
          {selectedIcp &&
            (sages.length > 0 || keywords.length > 0) &&
            (collectingRuns.get(selectedIcp) ? (
              <TriggerRunIndicator
                triggerRunId={collectingRuns.get(selectedIcp)!.triggerRunId}
                publicAccessToken={collectingRuns.get(selectedIcp)!.publicAccessToken}
                label="Collecting posts..."
                onComplete={() => {
                  collectingRuns.clear(selectedIcp);
                  fetchData();
                }}
                onError={() => collectingRuns.clear(selectedIcp)}
              />
            ) : (
              <button onClick={() => collectFeed(selectedIcp)} className="btn-primary text-sm">
                Collect Now
              </button>
            ))}
          <button onClick={fetchData} className="text-sm text-(--muted) hover:text-(--foreground) hover:underline">
            Refresh
          </button>
        </div>
      </div>
      <p className="text-sm text-(--muted) mb-4">
        Top-performing LinkedIn posts from sages and keyword searches, tailored to each ICP.
      </p>

      {/* ICP Tabs */}
      {icpDefs.filter(
        (icp) =>
          feeds[icp.id] && ((feeds[icp.id]?.sages?.length ?? 0) > 0 || (feeds[icp.id]?.keywords?.length ?? 0) > 0)
      ).length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-(--border)">
          {icpDefs
            .filter(
              (icp) =>
                feeds[icp.id] && ((feeds[icp.id]?.sages?.length ?? 0) > 0 || (feeds[icp.id]?.keywords?.length ?? 0) > 0)
            )
            .map((icp) => {
              const isActive = selectedIcp === icp.id;
              return (
                <button
                  key={icp.id}
                  onClick={() => setSelectedIcp(icp.id)}
                  className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                    isActive
                      ? "border-(--accent) text-(--foreground) font-medium"
                      : "border-transparent text-(--muted) hover:text-(--foreground)"
                  }`}
                >
                  {icp.name}
                </button>
              );
            })}
        </div>
      )}

      {/* Feed spec summary */}
      {currentFeed && (
        <div className="text-xs text-(--muted) mb-4 flex gap-4">
          <span>{sages.filter((s) => s.active).length} active sages</span>
          <span>{keywords.filter((k) => k.active).length} active keywords</span>
          <span>
            {dateKeys.length} day{dateKeys.length !== 1 ? "s" : ""} of data
          </span>
          <Link href={`/accounts/${account.slug}`} className="text-(--accent) hover:underline">
            Edit spec
          </Link>
        </div>
      )}

      {/* Day pagination */}
      {dateKeys.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSelectedDayIdx((i) => Math.min(i + 1, dateKeys.length - 1))}
            disabled={selectedDayIdx >= dateKeys.length - 1}
            className="text-sm text-(--muted) hover:text-(--foreground) disabled:opacity-30"
          >
            &larr; Older
          </button>
          <span className="text-sm font-medium">
            {currentDateKey && relativeDate(currentDateKey)} &mdash; {currentDateKey}
          </span>
          <button
            onClick={() => setSelectedDayIdx((i) => Math.max(i - 1, 0))}
            disabled={selectedDayIdx <= 0}
            className="text-sm text-(--muted) hover:text-(--foreground) disabled:opacity-30"
          >
            Newer &rarr;
          </button>
          <span className="text-xs text-(--muted)">({currentDayEntries.length} posts)</span>
        </div>
      )}

      {/* Feed entries — two columns */}
      {dateKeys.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-(--muted) mb-2">No feed entries yet.</p>
          <p className="text-sm text-(--muted)">
            Click &ldquo;Collect Now&rdquo; to fetch posts from your sages and keyword searches.
          </p>
        </div>
      ) : currentDayEntries.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-(--muted)">No posts collected on {currentDateKey}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Sage posts */}
          <div>
            <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>From Sages</span>
              <span className="text-xs font-normal">({sagePosts.length})</span>
            </h2>
            {sagePosts.length === 0 ? (
              <p className="text-sm text-(--muted)">No sage posts on this day.</p>
            ) : (
              <div className="space-y-4">
                {sagePosts.map((entry, i) => (
                  <LinkedInPostCard key={`sage-${i}`} entry={entry} />
                ))}
              </div>
            )}
          </div>

          {/* Right column: Keyword posts */}
          <div>
            <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>From Keywords</span>
              <span className="text-xs font-normal">({keywordPosts.length})</span>
            </h2>
            {keywordPosts.length === 0 ? (
              <p className="text-sm text-(--muted)">No keyword posts on this day.</p>
            ) : (
              <div className="space-y-4">
                {keywordPosts.map((entry, i) => (
                  <LinkedInPostCard key={`kw-${i}`} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
