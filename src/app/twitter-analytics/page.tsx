"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { z } from "zod";

const profilesSchema = z.object({ profiles: z.array(z.any()) });
const syncResponseSchema = z.object({ triggered: z.number(), runs: z.array(z.any()) });

interface TwitterProfile {
  id: string;
  twitterUrl: string;
  twitterHandle: string | null;
  displayName: string;
  analyticsEnabled: boolean;
  lastSyncedAt: string | null;
}

interface TwitterPost {
  id: string;
  content: string;
  tweetUrl: string;
  tweetType: string;
  likesCount: number;
  retweetsCount: number;
  quotesCount: number;
  repliesCount: number;
  bookmarksCount: number;
  viewsCount: number;
  category: string | null;
  postedAt: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function TwitterAnalyticsContent() {
  const { account } = useAccount();
  const [profiles, setProfiles] = useState<TwitterProfile[]>([]);
  const [posts, setPosts] = useState<TwitterPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${account.id}/twitter-profiles`, profilesSchema);
      const analyticsProfiles = (data.profiles as TwitterProfile[]).filter((p) => p.analyticsEnabled);
      setProfiles(analyticsProfiles);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchProfilePosts = async (profileId: string) => {
    if (!account) return;
    try {
      const res = await fetch(`/api/accounts/${account.id}/twitter-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (res.ok) {
        setStatus("Sync triggered. Refresh in a moment to see new data.");
      }
    } catch {
      setStatus("Failed to trigger sync.");
    }
  };

  const loadPosts = async (profileId: string) => {
    if (!account) return;
    // Use the engagement posts endpoint which returns all posts for outbound profiles,
    // but for analytics we want all posts. For now, fetch via a simple query.
    // TODO: Add a dedicated twitter analytics data endpoint
    setExpandedProfile(expandedProfile === profileId ? null : profileId);
  };

  const triggerSync = async () => {
    if (!account) return;
    setSyncing(true);
    try {
      await fetch(`/api/accounts/${account.id}/twitter-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setStatus("Sync triggered for all analytics profiles.");
    } catch {
      setStatus("Failed to trigger sync.");
    }
    setSyncing(false);
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Twitter Post Analytics</h1>
        <p className="text-sm text-[var(--muted)]">Select an account from the sidebar.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Twitter Post Analytics</h1>
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Twitter Post Analytics</h1>
        <button onClick={triggerSync} disabled={syncing || profiles.length === 0} className="btn-primary text-sm">
          {syncing ? "Syncing..." : "Sync All"}
        </button>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        Track performance of managed Twitter profiles. Enable analytics on profiles in the account overview.
      </p>

      {status && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-[var(--input)] border border-[var(--border)]">
          {status}
          <button onClick={() => setStatus(null)} className="ml-2 text-[var(--muted)] hover:text-white">
            &times;
          </button>
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-[var(--muted)] mb-2">No Twitter profiles with analytics enabled.</p>
          <p className="text-sm text-[var(--muted)]">
            Enable analytics on a Twitter profile in the account overview page.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{p.displayName || p.twitterHandle || "Unknown"}</span>
                  {p.twitterHandle && (
                    <a
                      href={p.twitterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--accent)] hover:underline ml-2"
                    >
                      @{p.twitterHandle}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">
                    {p.lastSyncedAt ? `Last synced ${formatDate(p.lastSyncedAt)}` : "Never synced"}
                  </span>
                  <button onClick={() => fetchProfilePosts(p.id)} className="btn-secondary text-xs">
                    Sync
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TwitterAnalyticsPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
      <TwitterAnalyticsContent />
    </Suspense>
  );
}
