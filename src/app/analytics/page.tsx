"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";
import { ProfileCard, ProfilesTable } from "./profile-card";
import { Delta } from "./shared";
import type { AnalyticsData, ManagedProfile } from "./types";

function AnalyticsContent() {
  const { account } = useAccount();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [profiles, setProfiles] = useState<ManagedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [profileName, setProfileName] = useState("");
  const [addingProfile, setAddingProfile] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [slackChannel, setSlackChannel] = useState("");
  const [slackChannelSaved, setSlackChannelSaved] = useState("");
  const [savingSlack, setSavingSlack] = useState(false);
  const base = account ? `/api/accounts/${account.id}/analytics` : null;

  const fetchSlackConfig = useCallback(async () => {
    if (!base) return;
    try {
      const res = await fetch(`${base}/config`);
      if (res.ok) {
        const d = await res.json();
        const ch = d.analyticsSlackChannel || "";
        setSlackChannel(ch);
        setSlackChannelSaved(ch);
      }
    } catch { /* ignore */ }
  }, [base]);

  const saveSlackChannel = async () => {
    if (!base) return;
    setSavingSlack(true);
    try {
      const res = await fetch(`${base}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyticsSlackChannel: slackChannel }),
      });
      if (res.ok) {
        const d = await res.json();
        const ch = d.analyticsSlackChannel || "";
        setSlackChannel(ch);
        setSlackChannelSaved(ch);
        setStatus("Slack channel saved.");
      } else {
        const err = await res.json();
        setStatus(err.error || "Failed to save Slack channel.");
      }
    } catch {
      setStatus("Failed to save Slack channel.");
    }
    setSavingSlack(false);
  };

  const fetchData = useCallback(async () => {
    if (!base) return;
    setLoading(true);
    try {
      const [analyticsRes, profilesRes] = await Promise.all([
        fetch(base),
        fetch(`${base}/profiles`),
      ]);
      const [analyticsData, profilesData] = await Promise.all([
        analyticsRes.json().catch(() => null),
        profilesRes.json().catch(() => null),
      ]);

      if (analyticsRes.ok && analyticsData?.profiles) {
        setData(analyticsData as AnalyticsData);
      } else {
        setData(null);
        const errorMessage =
          (analyticsData && typeof analyticsData.error === "string" && analyticsData.error) ||
          "Failed to load analytics.";
        setStatus(errorMessage);
      }

      if (profilesRes.ok && Array.isArray(profilesData)) {
        setProfiles(profilesData as ManagedProfile[]);
      } else {
        setProfiles([]);
      }
    } catch {
      setStatus("Failed to load analytics.");
    }
    setLoading(false);
  }, [base]);

  useEffect(() => { fetchData(); fetchSlackConfig(); }, [fetchData, fetchSlackConfig]);

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

  const runReport = async () => {
    if (!base) return;
    setRunning(true);
    setStatus("Running weekly report (scrape + report + Slack)...");
    try {
      const res = await fetch(`${base}/scrape`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        const triggered = typeof result.triggered === "number" ? result.triggered : 0;
        setStatus(`Report triggered for ${triggered} profile${triggered === 1 ? "" : "s"}. Data will update once complete.`);
      } else {
        setStatus(result.error || "Report failed.");
      }
    } catch {
      setStatus("Report failed.");
    }
    setRunning(false);
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
        Track performance of posts published by your managed client LinkedIn profiles.
      </p>

      {status && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-[var(--input)] border border-[var(--border)]">
          {status}
          <button onClick={() => setStatus(null)} className="ml-2 text-[var(--muted)] hover:text-white">&times;</button>
        </div>
      )}

      {/* Slack channel config */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold mb-2">Slack Weekly Reports</h2>
        <p className="text-xs text-[var(--muted)] mb-2">Set a Slack channel ID to receive weekly analytics reports.</p>
        <div className="flex gap-2 items-center">
          <input type="text" value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)} placeholder="C0AJLSV0M1A" className="w-64" />
          <button onClick={saveSlackChannel} disabled={savingSlack || slackChannel === slackChannelSaved} className="btn-primary text-sm">
            {savingSlack ? "Saving..." : "Save"}
          </button>
          {slackChannelSaved && <span className="text-xs text-green-400">Active</span>}
        </div>
      </div>

      {/* Add managed profile */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold mb-2">Add Managed Profile</h2>
        <p className="text-xs text-[var(--muted)] mb-2">Your client&apos;s LinkedIn profiles. Analytics tracks original posts from these profiles.</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input type="text" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://linkedin.com/in/client-name" className="w-full" />
          </div>
          <div className="w-48">
            <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Display name" className="w-full" />
          </div>
          <button onClick={addProfile} disabled={addingProfile || !profileUrl} className="btn-primary text-sm">{addingProfile ? "Adding..." : "Add"}</button>
        </div>
      </div>

      {profiles.length > 0 && (
        <ProfilesTable
          profiles={profiles}
          running={running}
          onRunReport={runReport}
        />
      )}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading analytics...</p>
      ) : data && data.profiles.length > 0 ? (
        <>
          {/* Account KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card">
              <div className="text-2xl font-light">{data.totals.totalPosts}</div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Posts Tracked</div>
            </div>
            <div className="card">
              <div className="text-2xl font-light">{data.totals.totalEngagement.toLocaleString()}</div>
              {data.totals.hasComparison && (
                <div className="text-sm mt-0.5"><Delta value={data.totals.deltaEngagement} /></div>
              )}
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Total Engagement</div>
            </div>
            <div className="card">
              <div className="text-2xl font-light">{data.profiles.length}</div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Profiles</div>
            </div>
            <div className="card">
              <div className="text-2xl font-light">
                {data.totals.hasComparison ? (
                  <Delta value={data.totals.deltaEngagement} />
                ) : "—"}
              </div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mt-1">Weekly Growth</div>
            </div>
          </div>

          {/* Per-profile breakdown */}
          {data.profiles.map((profile) => (
            <ProfileCard
              key={profile.profileId}
              profile={profile}
              isExpanded={expandedProfile === profile.profileId}
              onToggle={() => setExpandedProfile(
                expandedProfile === profile.profileId ? null : profile.profileId
              )}
            />
          ))}
        </>
      ) : profiles.length > 0 ? (
        <div className="card text-center py-8 text-[var(--muted)]">
          No posts tracked yet. Click &quot;Run Report&quot; to scrape posts and generate the first weekly report.
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
