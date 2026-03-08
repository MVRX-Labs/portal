"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";

interface Profile {
  id: string;
  linkedinUrl: string;
  displayName: string;
  engagementPersona: string;
  lastScrapedAt: string | null;
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
  postUrl: string;
  engagementStatus: string;
  agentComment: string | null;
  postedAt: string | null;
  likesCount: number;
  commentsCount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function EngagementContent() {
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

  const base = account ? `/api/accounts/${account.id}/engagement` : null;

  const fetchConfig = useCallback(async () => {
    if (!base) return;
    try {
      const res = await fetch(`${base}/config`);
      const data = await res.json();
      setSlackChannel(data.engagementSlackChannel || "");
      setSavedChannel(data.engagementSlackChannel || null);
    } catch { /* ignore */ }
  }, [base]);

  const fetchProfiles = useCallback(async () => {
    if (!base) return;
    setLoadingProfiles(true);
    try {
      const res = await fetch(`${base}/profiles`);
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : data.profiles || []);
    } catch { /* ignore */ }
    setLoadingProfiles(false);
  }, [base]);

  const fetchJobs = useCallback(async () => {
    if (!base) return;
    try {
      const res = await fetch(`${base}/jobs`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : data.jobs || []);
    } catch { /* ignore */ }
  }, [base]);

  const fetchPosts = useCallback(async () => {
    if (!base) return;
    try {
      const res = await fetch(`${base}/posts`);
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : data.posts || []);
    } catch { /* ignore */ }
  }, [base]);

  useEffect(() => {
    fetchConfig();
    fetchProfiles();
  }, [fetchConfig, fetchProfiles]);

  const saveConfig = async () => {
    if (!base) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`${base}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementSlackChannel: slackChannel }),
      });
      const data = await res.json();
      setSavedChannel(data.engagementSlackChannel || null);
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
      await fetch(`${base}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedin_urls: [profileUrl],
          engagement_persona: persona || "",
        }),
      });
      setProfileUrl("");
      setPersona("");
      await fetchProfiles();
    } catch {
      setStatus("Failed to add profile.");
    }
    setAddingProfile(false);
  };

  const uploadCsv = async (file: File) => {
    if (!base) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${base}/profiles/upload`, { method: "POST", body: form });
      const data = await res.json();
      setStatus(res.ok ? `Uploaded ${data.parsed} profiles.` : data.error);
      await fetchProfiles();
    } catch {
      setStatus("CSV upload failed.");
    }
  };

  const deleteProfile = async (profileId: string) => {
    if (!base || !confirm("Delete this profile? This cannot be undone.")) return;
    await fetch(`${base}/profiles/${profileId}`, { method: "DELETE" });
    await fetchProfiles();
  };

  const scrapeAll = async () => {
    if (!base) return;
    setScraping(true);
    try {
      const res = await fetch(`${base}/scrape`, { method: "POST" });
      const data = await res.json();
      setStatus(res.ok ? "Scrape triggered. Jobs will appear in history." : data.error);
      if (showJobs) await fetchJobs();
    } catch {
      setStatus("Failed to trigger scrape.");
    }
    setScraping(false);
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Engagement Bot</h1>
        <p className="text-sm text-[var(--muted)]">Select an account from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Engagement Bot</h1>
      <p className="text-sm text-[var(--muted)] mb-2">
        Track external LinkedIn profiles and engage with their posts via Slack.
      </p>

      {/* How it works */}
      <details className="mb-4 text-sm">
        <summary className="text-[var(--accent)] cursor-pointer hover:underline">How does this work?</summary>
        <div className="mt-2 p-3 rounded bg-[var(--input)] border border-[var(--border)] space-y-2 text-[var(--muted)]">
          <p><strong className="text-white">1. Add profiles</strong> — Enter LinkedIn URLs of people you want to monitor (prospects, industry leaders, etc). You can optionally set a persona that shapes the tone of AI-generated comments.</p>
          <p><strong className="text-white">2. Configure Slack</strong> — Set the Slack channel ID where post cards will be sent.</p>
          <p><strong className="text-white">3. Scrape</strong> — Click &quot;Scrape All&quot; to pull recent posts (last 24h) from each profile. New posts appear as interactive cards in your Slack channel.</p>
          <p><strong className="text-white">4. Engage via Slack</strong> — Each card has action buttons:</p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li><strong className="text-white">Comment</strong> — AI generates a context-aware comment you can copy and post on LinkedIn.</li>
            <li><strong className="text-white">Like / Repost</strong> — Flags the post for manual action on LinkedIn (these actions are not automated).</li>
            <li><strong className="text-white">Skip</strong> — Dismiss the post.</li>
          </ul>
          <p><strong className="text-white">CSV upload</strong> — Bulk add profiles via CSV with a &quot;linkedin&quot; column containing profile URLs.</p>
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
          {savedChannel && (
            <span className="text-xs text-green-400">Configured</span>
          )}
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
              placeholder="https://linkedin.com/in/username"
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
          <label className="btn-secondary text-sm cursor-pointer">
            Upload CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadCsv(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {/* Profiles table */}
      <div className="card mb-4 p-0 overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">
            Profiles {!loadingProfiles && `(${profiles.length})`}
          </h2>
          <button onClick={scrapeAll} disabled={scraping || profiles.length === 0} className="btn-secondary text-sm">
            {scraping ? "Scraping..." : "Scrape All"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">LinkedIn URL</th>
              <th className="px-3 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 font-medium">Last Scraped</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingProfiles ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--muted)]">Loading...</td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--muted)]">No profiles added yet</td>
              </tr>
            ) : (
              profiles.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-1.5">{p.displayName || "\u2014"}</td>
                  <td className="px-3 py-1.5">
                    <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline truncate block max-w-xs">
                      {p.linkedinUrl}
                    </a>
                  </td>
                  <td className="px-3 py-1.5">{p.engagementPersona || "\u2014"}</td>
                  <td className="px-3 py-1.5 text-[var(--muted)] whitespace-nowrap">
                    {p.lastScrapedAt ? formatDate(p.lastScrapedAt) : "\u2014"}
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
          onClick={() => { setShowJobs(!showJobs); if (!showJobs) fetchJobs(); }}
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
                <div key={j.id} className="text-sm flex items-center gap-3 py-1 border-b border-[var(--border)] last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${
                    j.status === "completed" ? "bg-green-500/20 text-green-400" :
                    j.status === "failed" ? "bg-red-500/20 text-red-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {j.status}
                  </span>
                  <span>Posts: {j.postsFound} found, {j.postsNew} new</span>
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

      {/* Recent posts */}
      <div className="card mb-4">
        <button
          onClick={() => { setShowPosts(!showPosts); if (!showPosts) fetchPosts(); }}
          className="text-sm font-semibold w-full text-left flex justify-between items-center"
        >
          Recent Posts
          <span className="text-[var(--muted)]">{showPosts ? "\u25B2" : "\u25BC"}</span>
        </button>
        {showPosts && (
          <div className="mt-2 space-y-2">
            {posts.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No posts yet.</p>
            ) : (
              posts.slice(0, 20).map((p) => (
                <div key={p.id} className="text-sm py-2 border-b border-[var(--border)] last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${
                      p.engagementStatus === "engaged" || p.engagementStatus === "awaiting_action" ? "bg-green-500/20 text-green-400" :
                      p.engagementStatus === "sent_to_slack" ? "bg-blue-500/20 text-blue-400" :
                      p.engagementStatus === "failed" ? "bg-red-500/20 text-red-400" :
                      p.engagementStatus === "skip" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {p.engagementStatus || "new"}
                    </span>
                    {p.postUrl && (
                      <a href={p.postUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline text-xs">
                        View post
                      </a>
                    )}
                    <span className="text-[var(--muted)] ml-auto whitespace-nowrap text-xs">{p.postedAt ? formatDate(p.postedAt) : "\u2014"}</span>
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

export default function LinkedInEngagementPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
      <EngagementContent />
    </Suspense>
  );
}
