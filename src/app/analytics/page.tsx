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
  totalReposts: number;
  totalEngagement: number;
  deltaLikes: number;
  deltaComments: number;
  deltaReposts: number;
  deltaTotal: number;
  postsWithGrowth: number;
  snapshotCount: number;
  hasComparison: boolean;
  lastScrapedAt: string | null;
}

interface PostDelta {
  postId: string;
  content: string;
  postUrl: string;
  postedAt: string | null;
  currentLikes: number;
  currentComments: number;
  currentReposts: number;
  deltaLikes: number;
  deltaComments: number;
  deltaReposts: number;
  deltaTotal: number;
  hasDelta: boolean;
}

interface ManagedProfile {
  id: string;
  linkedinUrl: string;
  displayName: string;
  lastScrapedAt: string | null;
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
  const [profiles, setProfiles] = useState<ManagedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  // Add profile form
  const [profileUrl, setProfileUrl] = useState("");
  const [profileName, setProfileName] = useState("");
  const [addingProfile, setAddingProfile] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const base = account ? `/api/accounts/${account.id}/analytics` : null;

  const fetchData = useCallback(async () => {
    if (!base) return;
    setLoading(true);
    try {
      const [analyticsRes, profilesRes] = await Promise.all([
        fetch(base),
        fetch(`${base}/profiles`),
      ]);
      setData(await analyticsRes.json());
      setProfiles(await profilesRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [base]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addProfile = async () => {
    if (!base || !profileUrl) return;
    setAddingProfile(true);
    try {
      const res = await fetch(`${base}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_url: profileUrl, display_name: profileName }),
      });
      if (res.ok) {
        setProfileUrl("");
        setProfileName("");
        setStatus("Profile added.");
        await fetchData();
      } else {
        const err = await res.json();
        setStatus(err.error || "Failed to add profile.");
      }
    } catch {
      setStatus("Failed to add profile.");
    }
    setAddingProfile(false);
  };

  const scrapeAll = async () => {
    if (!base) return;
    setScraping(true);
    setStatus("Scraping...");
    try {
      const res = await fetch(`${base}/scrape`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const summary = data.results
          .map((r: { name: string; total: number; newCount: number }) => `${r.name}: ${r.total} posts (${r.newCount} new)`)
          .join(", ");
        setStatus(`Scrape complete — ${summary}`);
        await fetchData();
      } else {
        setStatus(data.error || "Scrape failed.");
      }
    } catch {
      setStatus("Scrape failed.");
    }
    setScraping(false);
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Post Analytics</h1>
        <p className="text-sm text-[var(--muted)]">Select an account from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Post Analytics</h1>
      <p className="text-sm text-[var(--muted)] mb-4">
        Track performance of your clients&apos; LinkedIn profiles.
      </p>

      {status && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-[var(--input)] border border-[var(--border)]">
          {status}
          <button onClick={() => setStatus(null)} className="ml-2 text-[var(--muted)] hover:text-white">&times;</button>
        </div>
      )}

      {/* Add managed profile */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold mb-2">Add Managed Profile</h2>
        <p className="text-xs text-[var(--muted)] mb-2">
          These are your client&apos;s LinkedIn profiles — the accounts you manage and want to track performance for.
        </p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://linkedin.com/in/client-name"
              className="w-full"
            />
          </div>
          <div className="w-48">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Display name"
              className="w-full"
            />
          </div>
          <button onClick={addProfile} disabled={addingProfile || !profileUrl} className="btn-primary text-sm">
            {addingProfile ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* Profiles + scrape */}
      {profiles.length > 0 && (
        <div className="card mb-4 p-0 overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold">Managed Profiles ({profiles.length})</h2>
            <button onClick={scrapeAll} disabled={scraping} className="btn-secondary text-sm">
              {scraping ? "Scraping..." : "Scrape All"}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">LinkedIn URL</th>
                <th className="px-3 py-2 font-medium">Last Scraped</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-1.5">{p.displayName || "—"}</td>
                  <td className="px-3 py-1.5">
                    <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline truncate block max-w-xs">
                      {p.linkedinUrl}
                    </a>
                  </td>
                  <td className="px-3 py-1.5 text-[var(--muted)] whitespace-nowrap">
                    {p.lastScrapedAt ? formatDate(p.lastScrapedAt) : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading analytics...</p>
      ) : data && data.growth.profiles.length > 0 ? (
        <>
          {/* Account KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card">
              <div className="text-2xl font-light">{data.growth.totals.totalPosts}</div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Posts Tracked</div>
            </div>
            <div className="card">
              <div className="text-2xl font-light">{data.growth.totals.totalEngagement.toLocaleString()}</div>
              {data.growth.totals.hasComparison && (
                <div className="text-sm mt-0.5"><Delta value={data.growth.totals.deltaTotal} /></div>
              )}
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Total Engagement</div>
            </div>
            <div className="card">
              <div className="text-2xl font-light">{data.growth.profiles.length}</div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Profiles</div>
            </div>
            <div className="card">
              <div className="text-2xl font-light">
                {data.growth.profiles.length > 0 ? data.growth.profiles[0].snapshotCount : 0}
              </div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Snapshots</div>
            </div>
          </div>

          {/* Per-profile breakdown */}
          {data.growth.profiles.map((profile) => {
            const deltas = data.profileDeltas[profile.profileId] || [];
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
                              <span>🔄 <Delta value={d.deltaReposts} /></span>
                              <span className="font-semibold min-w-[60px] text-right">
                                <Delta value={d.deltaTotal} />
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                            <th className="py-1.5 font-medium text-right">Reposts</th>
                            <th className="py-1.5 font-medium text-right">Eng</th>
                            {profile.hasComparison && <th className="py-1.5 font-medium text-right">Δ</th>}
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
                                {d.postedAt && <div className="text-xs text-[var(--muted)]">{formatDate(d.postedAt)}</div>}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">{d.currentLikes.toLocaleString()}</td>
                              <td className="py-1.5 text-right tabular-nums">{d.currentComments}</td>
                              <td className="py-1.5 text-right tabular-nums">{d.currentReposts}</td>
                              <td className="py-1.5 text-right tabular-nums font-semibold">
                                {(d.currentLikes + d.currentComments + d.currentReposts).toLocaleString()}
                              </td>
                              {profile.hasComparison && (
                                <td className="py-1.5 text-right"><Delta value={d.deltaTotal} /></td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {!profile.hasComparison && (
                      <p className="text-xs text-[var(--muted)] italic">
                        Baseline data — growth tracking starts after the next scrape.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      ) : profiles.length > 0 ? (
        <div className="card text-center py-8 text-[var(--muted)]">
          No posts tracked yet. Click &quot;Scrape All&quot; to take the first snapshot.
        </div>
      ) : (
        <div className="card text-center py-8 text-[var(--muted)]">
          Add your client&apos;s LinkedIn profiles above to start tracking their post performance.
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
