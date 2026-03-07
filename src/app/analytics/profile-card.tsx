"use client";

import type { ManagedProfile, ProfileSummary } from "./types";
import { Delta, formatDate } from "./shared";

interface ProfilesTableProps {
  profiles: ManagedProfile[];
  running: boolean;
  onRunReport: () => void;
}

export function ProfilesTable({ profiles, running, onRunReport }: ProfilesTableProps) {
  return (
    <div className="card mb-4 p-0 overflow-x-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold">Managed Profiles ({profiles.length})</h2>
        <button onClick={onRunReport} disabled={running} className="btn-secondary text-sm">
          {running ? "Running..." : "Run Report"}
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
  );
}

interface ProfileCardProps {
  profile: ProfileSummary;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ProfileCard({ profile, isExpanded, onToggle }: ProfileCardProps) {
  const report = profile.report;

  return (
    <div className="card mb-4">
      <button
        onClick={onToggle}
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
              <span className="ml-1"><Delta value={profile.deltaEngagement} /></span>
            )}
          </span>
          <span className="text-[var(--muted)]">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {isExpanded && report && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-[var(--muted)]">
            Report: {formatDate(report.weekStart)} — {formatDate(report.weekEnd)}
          </p>

          {report.newPosts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide mb-2">
                New Posts This Week ({report.newPosts.length})
              </h3>
              <div className="space-y-1">
                {report.newPosts.map((p) => (
                  <div key={p.postId} className="flex items-start gap-3 text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="flex-1 line-clamp-1 text-[var(--muted)]">
                      {p.postUrl ? (
                        <a href={p.postUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.content.slice(0, 100)}</a>
                      ) : p.content.slice(0, 100)}
                    </div>
                    <span className="tabular-nums">{p.engagement.toLocaleString()} eng</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.biggestMovers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide mb-2">
                Biggest Movers This Week
              </h3>
              <div className="space-y-1">
                {report.biggestMovers.slice(0, 5).map((d) => (
                  <div key={d.postId} className="flex items-start gap-3 text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="flex-1 line-clamp-1 text-[var(--muted)]">{d.content.slice(0, 80)}</div>
                    <span>Likes <Delta value={d.deltaLikes} /></span>
                    <span>Comments <Delta value={d.deltaComments} /></span>
                    <span>Reposts <Delta value={d.deltaReposts} /></span>
                    <span className="font-semibold min-w-[60px] text-right">
                      <Delta value={d.deltaEngagement} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!profile.hasComparison && (
            <p className="text-xs text-[var(--muted)] italic">
              First report — week-over-week comparisons will appear after the next weekly report.
            </p>
          )}
        </div>
      )}

      {isExpanded && !report && (
        <div className="mt-4 text-sm text-[var(--muted)]">
          No weekly report generated yet. Click &quot;Run Report&quot; to create the first one.
        </div>
      )}
    </div>
  );
}
