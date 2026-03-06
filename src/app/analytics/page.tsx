"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";

interface ProfileGrowth {
  profileId: string;
  displayName: string;
  linkedinUrl: string;
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalEngagement: number;
  deltaLikes: number;
  deltaComments: number;
  deltaTotal: number;
  postsWithGrowth: number;
  snapshotCount: number;
  hasComparison: boolean;
}

interface PostDelta {
  postId: string;
  content: string;
  postUrl: string;
  postedAt: string | null;
  currentLikes: number;
  currentComments: number;
  deltaLikes: number;
  deltaComments: number;
  deltaTotal: number;
  hasDelta: boolean;
}

interface AnalyticsData {
  growth: {
    profiles: ProfileGrowth[];
    totals: {
      totalPosts: number;
      totalEngagement: number;
      deltaTotal: number;
      hasComparison: boolean;
    };
  };
  profileDeltas: Record<string, PostDelta[]>;
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-[var(--muted)]">—</span>;
  return (
    <span className={value > 0 ? "text-green-400" : "text-red-400"}>
      {value > 0 ? "+" : ""}{value.toLocaleString()}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function AnalyticsContent() {
  const { account } = useAccount();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/analytics`);
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, [account]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Post Analytics</h1>
        <p className="text-sm text-[var(--muted)]">Select an account from the sidebar.</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Post Analytics</h1>
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      </div>
    );
  }

  const { growth, profileDeltas } = data;
  const { totals, profiles } = growth;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Post Analytics</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Engagement tracking and growth across all managed profiles.
        {!totals.hasComparison && " Baseline data — growth tracking starts after the next scrape."}
      </p>

      {/* Account-level KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="text-2xl font-light">{totals.totalPosts}</div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Posts Tracked</div>
        </div>
        <div className="card">
          <div className="text-2xl font-light">{totals.totalEngagement.toLocaleString()}</div>
          {totals.hasComparison && (
            <div className="text-sm mt-0.5"><Delta value={totals.deltaTotal} /></div>
          )}
          <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Total Engagement</div>
        </div>
        <div className="card">
          <div className="text-2xl font-light">{profiles.length}</div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Profiles</div>
        </div>
        <div className="card">
          <div className="text-2xl font-light">
            {profiles.length > 0 ? profiles[0].snapshotCount : 0}
          </div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Snapshots</div>
        </div>
      </div>

      {/* Per-profile breakdown */}
      {profiles.map((profile) => {
        const deltas = profileDeltas[profile.profileId] || [];
        const isExpanded = expandedProfile === profile.profileId;
        const topMovers = deltas
          .filter((d) => d.hasDelta && d.deltaTotal > 0)
          .sort((a, b) => b.deltaTotal - a.deltaTotal)
          .slice(0, 5);
        const top5 = deltas.slice(0, 5);

        return (
          <div key={profile.profileId} className="card mb-4">
            <button
              onClick={() => setExpandedProfile(isExpanded ? null : profile.profileId)}
              className="w-full text-left flex items-center justify-between"
            >
              <div>
                <span className="font-semibold">{profile.displayName || "Unknown"}</span>
                <span className="text-sm text-[var(--muted)] ml-2">{profile.totalPosts} posts</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm">
                  Eng: <strong>{profile.totalEngagement.toLocaleString()}</strong>
                  {profile.hasComparison && (
                    <span className="ml-1"><Delta value={profile.deltaTotal} /></span>
                  )}
                </span>
                <span className="text-[var(--muted)]">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="mt-4 space-y-4">
                {/* Top movers */}
                {topMovers.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide mb-2">
                      📈 Top Movers
                    </h3>
                    <div className="space-y-1">
                      {topMovers.map((d) => (
                        <div key={d.postId} className="flex items-start gap-3 text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                          <div className="flex-1 line-clamp-1 text-[var(--muted)]">{d.content}</div>
                          <span>👍 <Delta value={d.deltaLikes} /></span>
                          <span>💬 <Delta value={d.deltaComments} /></span>
                          <span className="font-semibold min-w-[60px] text-right">
                            <Delta value={d.deltaTotal} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top 5 all-time */}
                <div>
                  <h3 className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide mb-2">
                    🏆 Top 5 Posts
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                        <th className="py-1.5 font-medium">#</th>
                        <th className="py-1.5 font-medium">Post</th>
                        <th className="py-1.5 font-medium text-right">Likes</th>
                        <th className="py-1.5 font-medium text-right">Comments</th>
                        <th className="py-1.5 font-medium text-right">Eng</th>
                        {profile.hasComparison && (
                          <th className="py-1.5 font-medium text-right">Δ</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {top5.map((d, i) => (
                        <tr key={d.postId} className="border-b border-[var(--border)] last:border-0">
                          <td className="py-1.5 text-[var(--muted)]">{i + 1}</td>
                          <td className="py-1.5">
                            <div className="line-clamp-1 max-w-md">
                              {d.postUrl ? (
                                <a href={d.postUrl} target="_blank" rel="noreferrer" className="hover:underline">
                                  {d.content.slice(0, 80)}{d.content.length > 80 ? "…" : ""}
                                </a>
                              ) : (
                                <span>{d.content.slice(0, 80)}{d.content.length > 80 ? "…" : ""}</span>
                              )}
                            </div>
                            {d.postedAt && (
                              <div className="text-xs text-[var(--muted)]">{formatDate(d.postedAt)}</div>
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{d.currentLikes.toLocaleString()}</td>
                          <td className="py-1.5 text-right tabular-nums">{d.currentComments}</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold">
                            {(d.currentLikes + d.currentComments).toLocaleString()}
                          </td>
                          {profile.hasComparison && (
                            <td className="py-1.5 text-right"><Delta value={d.deltaTotal} /></td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {profiles.length === 0 && (
        <div className="card text-center py-8 text-[var(--muted)]">
          No profiles tracked yet. Add profiles in the Engagement Bot page first.
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
