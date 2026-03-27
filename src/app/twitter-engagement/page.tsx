"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";
import {
  twitterEngagementConfigResponseSchema,
  twitterEngagementProfilesArraySchema,
  twitterEngagementJobsArraySchema,
  twitterEngagementPostsArraySchema,
  twitterEngagementScrapeResponseSchema,
  deleteTwitterEngagementProfileResponseSchema,
} from "@/lib/api-schemas/twitter-engagement";
import { apiFetch, apiMutate } from "@/lib/api-client";

interface Profile {
  id: string;
  twitterUrl: string;
  twitterHandle: string | null;
  displayName: string;
  engagementPersona: string;
  lastSyncedAt: string | null;
}

interface Job {
  id: string;
  status: string;
  postsFound: number;
  postsNew: number;
  errorMessage: string | null;
  triggerRunId: string | null;
  createdAt: string;
}

interface Post {
  id: string;
  content: string;
  tweetUrl: string;
  engagementStatus: string;
  agentComment: string | null;
  postedAt: string | null;
  likesCount: number;
  retweetsCount: number;
  repliesCount: number;
  viewsCount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function TwitterEngagementContent() {
  const { account } = useAccount();

  const [slackChannel, setSlackChannel] = useState("");
  const [savedChannel, setSavedChannel] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [profileUrl, setProfileUrl] = useState("");
  const [persona, setPersona] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [showJobs, setShowJobs] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [showPosts, setShowPosts] = useState(false);

  const [scraping, setScraping] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const base = account ? `/api/accounts/${account.id}/twitter-engagement` : null;

  const fetchConfig = useCallback(async () => {
    if (!base) return;
    try {
      const data = await apiFetch(`${base}/config`, twitterEngagementConfigResponseSchema);
      setSlackChannel(data.twitterEngagementSlackChannel || "");
      setSavedChannel(data.twitterEngagementSlackChannel || null);
    } catch {
      /* ignore */
    }
  }, [base]);

  const fetchProfiles = useCallback(async () => {
    if (!base) return;
    setLoadingProfiles(true);
    try {
      const data = await apiFetch(`${base}/profiles`, twitterEngagementProfilesArraySchema);
      setProfiles(data as Profile[]);
    } catch {
      /* ignore */
    }
    setLoadingProfiles(false);
  }, [base]);

  const fetchJobs = useCallback(async () => {
    if (!base) return;
    try {
      const data = await apiFetch(`${base}/jobs`, twitterEngagementJobsArraySchema);
      setJobs(data as unknown as Job[]);
    } catch {
      /* ignore */
    }
  }, [base]);

  const fetchPosts = useCallback(async () => {
    if (!base) return;
    try {
      const data = await apiFetch(`${base}/posts`, twitterEngagementPostsArraySchema);
      setPosts(data as unknown as Post[]);
    } catch {
      /* ignore */
    }
  }, [base]);

  useEffect(() => {
    fetchConfig();
    fetchProfiles();
  }, [fetchConfig, fetchProfiles]);

  const saveConfig = async () => {
    if (!base) return;
    setSavingConfig(true);
    try {
      const data = await apiMutate(`${base}/config`, twitterEngagementConfigResponseSchema, {
        method: "PATCH",
        body: { twitterEngagementSlackChannel: slackChannel },
      });
      setSavedChannel(data.twitterEngagementSlackChannel || null);
      setStatus("Slack channel saved.");
    } catch {
      setStatus("Failed to save config.");
    }
    setSavingConfig(false);
  };

  const addProfile = async () => {
    if (!base || !profileUrl) return;
    setAddingProfile(true);
    try {
      await apiMutate(`${base}/profiles`, twitterEngagementProfilesArraySchema, {
        method: "POST",
        body: {
          twitter_urls: [profileUrl],
          engagement_persona: persona || "",
        },
      });
      setProfileUrl("");
      setPersona("");
      await fetchProfiles();
    } catch {
      setStatus("Failed to add profile.");
    }
    setAddingProfile(false);
  };

  const deleteProfile = async (profileId: string) => {
    if (!base || !confirm("Delete this profile? This cannot be undone.")) return;
    try {
      await apiMutate(`${base}/profiles/${profileId}`, deleteTwitterEngagementProfileResponseSchema, {
        method: "DELETE",
      });
      await fetchProfiles();
    } catch {
      setStatus("Failed to delete profile.");
    }
  };

  const scrapeAll = async () => {
    if (!base) return;
    setScraping(true);
    try {
      await apiMutate(`${base}/scrape`, twitterEngagementScrapeResponseSchema, {
        method: "POST",
        body: {},
      });
      setStatus("Scrape triggered. Jobs will appear in history.");
      if (showJobs) await fetchJobs();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to trigger scrape.");
    }
    setScraping(false);
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Twitter Engagement Bot</h1>
        <p className="text-sm text-[var(--muted)]">Select an account from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Twitter Engagement Bot</h1>
      <p className="text-sm text-[var(--muted)] mb-2">
        Track external Twitter/X profiles and engage with their tweets via Slack.
      </p>

      {/* How it works */}
      <details className="mb-4 text-sm">
        <summary className="text-[var(--accent)] cursor-pointer hover:underline">How does this work?</summary>
        <div className="mt-2 p-3 rounded bg-[var(--input)] border border-[var(--border)] space-y-2 text-[var(--muted)]">
          <p>
            <strong className="text-white">1. Add profiles</strong> — Enter Twitter/X URLs or @handles of people you
            want to monitor. Optionally set a persona that shapes the tone of AI-generated replies.
          </p>
          <p>
            <strong className="text-white">2. Configure Slack</strong> — Set the Slack channel ID where tweet cards will
            be sent.
          </p>
          <p>
            <strong className="text-white">3. Scrape</strong> — Click &quot;Scrape All&quot; to pull recent tweets from
            each profile. New tweets appear as interactive cards in your Slack channel.
          </p>
          <p>
            <strong className="text-white">4. Engage via Slack</strong> — Each card has action buttons:
          </p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>
              <strong className="text-white">Reply</strong> — AI generates a context-aware reply you can copy and post.
            </li>
            <li>
              <strong className="text-white">Like / Retweet</strong> — Flags the tweet for manual action on Twitter (not
              automated).
            </li>
            <li>
              <strong className="text-white">Skip</strong> — Dismiss the tweet.
            </li>
          </ul>
        </div>
      </details>

      {status && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-[var(--input)] border border-[var(--border)]">
          {status}
          <button onClick={() => setStatus(null)} className="ml-2 text-[var(--muted)] hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Config bar */}
      <div className="card mb-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium whitespace-nowrap">Slack Channel</label>
          <input
            type="text"
            value={slackChannel}
            onChange={(e) => setSlackChannel(e.target.value)}
            placeholder="C0123456789"
            className="flex-1"
          />
          <button onClick={saveConfig} disabled={savingConfig} className="btn-primary text-sm">
            {savingConfig ? "Saving..." : "Save"}
          </button>
          {savedChannel && <span className="text-xs text-green-400">Configured</span>}
        </div>
      </div>

      {/* Add profiles */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold mb-2">Add Profile</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://x.com/username or @username"
              className="w-full"
            />
          </div>
          <div className="w-48">
            <input
              type="text"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Persona (optional)"
              className="w-full"
            />
          </div>
          <button onClick={addProfile} disabled={addingProfile || !profileUrl} className="btn-primary text-sm">
            {addingProfile ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* Profiles table */}
      <div className="card mb-4 p-0 overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">Profiles {!loadingProfiles && `(${profiles.length})`}</h2>
          <button onClick={scrapeAll} disabled={scraping || profiles.length === 0} className="btn-secondary text-sm">
            {scraping ? "Scraping..." : "Scrape All"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Handle</th>
              <th className="px-3 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 font-medium">Last Scraped</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingProfiles ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--muted)]">
                  Loading...
                </td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--muted)]">
                  No profiles added yet
                </td>
              </tr>
            ) : (
              profiles.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-1.5">{p.displayName || "\u2014"}</td>
                  <td className="px-3 py-1.5">
                    <a
                      href={p.twitterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      @{p.twitterHandle || p.twitterUrl}
                    </a>
                  </td>
                  <td className="px-3 py-1.5">{p.engagementPersona || "\u2014"}</td>
                  <td className="px-3 py-1.5 text-[var(--muted)] whitespace-nowrap">
                    {p.lastSyncedAt ? formatDate(p.lastSyncedAt) : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => deleteProfile(p.id)} className="text-red-400 hover:text-red-300 text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Job history */}
      <div className="card mb-4">
        <button
          onClick={() => {
            setShowJobs(!showJobs);
            if (!showJobs) fetchJobs();
          }}
          className="text-sm font-semibold w-full text-left flex justify-between items-center"
        >
          Job History
          <span className="text-[var(--muted)]">{showJobs ? "\u25B2" : "\u25BC"}</span>
        </button>
        {showJobs && (
          <div className="mt-2 space-y-2">
            {jobs.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No jobs yet.</p>
            ) : (
              jobs.slice(0, 20).map((j) => (
                <div
                  key={j.id}
                  className="text-sm flex items-center gap-3 py-1 border-b border-[var(--border)] last:border-0"
                >
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${
                      j.status === "completed"
                        ? "bg-green-500/20 text-green-400"
                        : j.status === "failed"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {j.status}
                  </span>
                  <span>
                    Tweets: {j.postsFound} found, {j.postsNew} new
                  </span>
                  {j.errorMessage && <span className="text-red-400 truncate max-w-xs">{j.errorMessage}</span>}
                  {j.triggerRunId && (
                    <span className="text-[var(--muted)] text-xs truncate max-w-[120px]" title={j.triggerRunId}>
                      {j.triggerRunId}
                    </span>
                  )}
                  <span className="text-[var(--muted)] ml-auto whitespace-nowrap">{formatDate(j.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Recent tweets */}
      <div className="card mb-4">
        <button
          onClick={() => {
            setShowPosts(!showPosts);
            if (!showPosts) fetchPosts();
          }}
          className="text-sm font-semibold w-full text-left flex justify-between items-center"
        >
          Recent Tweets
          <span className="text-[var(--muted)]">{showPosts ? "\u25B2" : "\u25BC"}</span>
        </button>
        {showPosts && (
          <div className="mt-2 space-y-2">
            {posts.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No tweets yet.</p>
            ) : (
              posts.slice(0, 20).map((p) => (
                <div key={p.id} className="text-sm py-2 border-b border-[var(--border)] last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${
                        p.engagementStatus === "engaged" || p.engagementStatus === "awaiting_action"
                          ? "bg-green-500/20 text-green-400"
                          : p.engagementStatus === "sent_to_slack"
                            ? "bg-blue-500/20 text-blue-400"
                            : p.engagementStatus === "failed"
                              ? "bg-red-500/20 text-red-400"
                              : p.engagementStatus === "skip"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {p.engagementStatus || "new"}
                    </span>
                    {p.tweetUrl && (
                      <a
                        href={p.tweetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline text-xs"
                      >
                        View tweet
                      </a>
                    )}
                    <span className="text-[var(--muted)] text-xs">{p.viewsCount.toLocaleString()} views</span>
                    <span className="text-[var(--muted)] ml-auto whitespace-nowrap text-xs">
                      {p.postedAt ? formatDate(p.postedAt) : "\u2014"}
                    </span>
                  </div>
                  <p className="text-[var(--muted)] line-clamp-2">{p.content}</p>
                  {p.agentComment && (
                    <p className="mt-1 text-xs text-green-400/80 italic">&quot;{p.agentComment}&quot;</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TwitterEngagementPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
      <TwitterEngagementContent />
    </Suspense>
  );
}
