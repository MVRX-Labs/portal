"use client";

import { useEffect, useState, useCallback } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

interface SyncState {
  id: string;
  userName: string;
  userEmail: string;
  calendarId: string;
  hasSyncToken: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  updatedAt: string;
}

interface LinkedAccount {
  accountId: string;
  accountName: string;
  matchConfidence: string;
  matchedVia: string;
}

interface LinkedContact {
  contactId: string;
  contactName: string;
  attendeeEmail: string;
  matchConfidence: string;
  matchedVia: string;
}

interface CalendarEvent {
  id: string;
  summary: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  organizerEmail: string | null;
  status: string;
  calendarId: string;
  attendees: Array<{ email: string; displayName?: string }>;
  htmlLink: string | null;
  notifiedAt: string | null;
  createdAt: string;
  linkedAccounts: LinkedAccount[];
  linkedContacts: LinkedContact[];
}

interface Stats {
  totalEvents: number;
  upcomingEvents: number;
  linkedAccounts: number;
  linkedContacts: number;
}

interface ActiveSync {
  triggerRunId: string;
  publicAccessToken: string;
}

function RunProgressInline({
  triggerRunId,
  publicAccessToken,
  onComplete,
}: {
  triggerRunId: string;
  publicAccessToken: string;
  onComplete: () => void;
}) {
  const { run } = useRealtimeRun(triggerRunId, {
    accessToken: publicAccessToken,
    onComplete: () => onComplete(),
  });

  const progress = (run?.metadata as { progress?: { step: string; percentage: number } } | undefined)?.progress;

  const isFinished = run?.status === "COMPLETED" || run?.status === "FAILED" || run?.status === "CANCELED";

  if (isFinished) return null;

  return (
    <div className="p-3 rounded-md bg-[rgba(59,130,246,0.08)] border border-[rgba(59,130,246,0.2)] text-sm space-y-2">
      <p className="font-medium text-(--accent)">{progress?.step || "Starting sync..."}</p>
      {progress && (
        <div className="h-2 rounded-full bg-[rgba(59,130,246,0.15)] overflow-hidden">
          <div
            className="h-full rounded-full bg-(--accent) transition-all duration-500"
            style={{ width: `${Math.max(progress.percentage, 3)}%` }}
          />
        </div>
      )}
      {!progress && (
        <div className="h-2 rounded-full bg-[rgba(59,130,246,0.15)] overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-(--accent) animate-pulse" />
        </div>
      )}
    </div>
  );
}

export default function AdminCalendarPage() {
  const [tab, setTab] = useState<"events" | "sync">("events");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeSync, setActiveSync] = useState<ActiveSync | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, syncRes, statsRes] = await Promise.all([
        fetch("/api/admin/calendar-events?view=events&limit=50"),
        fetch("/api/admin/calendar-events?view=sync-state"),
        fetch("/api/admin/calendar-events?view=stats"),
      ]);

      const eventsData = await eventsRes.json();
      const syncData = await syncRes.json();
      const statsData = await statsRes.json();

      setEvents(eventsData.events || []);
      setSyncStates(syncData.syncStates || []);
      setStats(statsData.stats || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setActiveSync(null);

    try {
      const res = await fetch("/api/admin/calendar-sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setSyncMessage(data.error || "Failed to trigger sync");
        setSyncing(false);
        return;
      }

      setActiveSync({
        triggerRunId: data.triggerRunId,
        publicAccessToken: data.publicAccessToken,
      });
    } catch {
      setSyncMessage("Failed to trigger sync");
      setSyncing(false);
    }
  };

  const handleSyncComplete = () => {
    setActiveSync(null);
    setSyncing(false);
    setSyncMessage("Sync completed. Refreshing data...");
    loadData();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    });
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    });
  };

  const isPast = (iso: string) => new Date(iso) < new Date();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Calendar Sync</h1>
          <p className="text-sm text-(--muted)">Google Calendar scraping for external meetings</p>
        </div>
        <button onClick={handleRunSync} disabled={syncing} className="btn-primary">
          {syncing ? "Syncing..." : "Run Sync Now"}
        </button>
      </div>

      {syncMessage && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-(--input) border border-(--border)">{syncMessage}</div>
      )}

      {activeSync && (
        <div className="mb-4">
          <RunProgressInline
            triggerRunId={activeSync.triggerRunId}
            publicAccessToken={activeSync.publicAccessToken}
            onComplete={handleSyncComplete}
          />
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card text-center">
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <div className="text-xs text-(--muted)">Total Events</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold">{stats.upcomingEvents}</div>
            <div className="text-xs text-(--muted)">Upcoming</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold">{stats.linkedAccounts}</div>
            <div className="text-xs text-(--muted)">Linked Accounts</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold">{stats.linkedContacts}</div>
            <div className="text-xs text-(--muted)">Linked Contacts</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-(--border)">
        <button
          onClick={() => setTab("events")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "events" ? "border-(--accent) text-white" : "border-transparent text-(--muted) hover:text-white"
          }`}
        >
          Events ({events.length})
        </button>
        <button
          onClick={() => setTab("sync")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "sync" ? "border-(--accent) text-white" : "border-transparent text-(--muted) hover:text-white"
          }`}
        >
          Sync State ({syncStates.length})
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-8 text-(--muted)">Loading...</div>
      ) : tab === "events" ? (
        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="card text-center py-8 text-(--muted)">
              No calendar events yet. Run a sync to get started.
            </div>
          ) : (
            events.map((event) => (
              <div key={event.id} className={`card ${isPast(event.startTime) ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate">{event.summary || "(No title)"}</h3>
                      {event.status === "cancelled" && <span className="badge badge-failed text-xs">Cancelled</span>}
                      {event.notifiedAt && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
                          Notified
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-(--muted) space-y-0.5">
                      <div>
                        {formatTime(event.startTime)} - {formatTime(event.endTime)}
                      </div>
                      {event.location && <div>Location: {event.location}</div>}
                      <div>Calendar: {event.calendarId}</div>
                    </div>
                  </div>
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-(--accent) hover:underline whitespace-nowrap"
                    >
                      Open
                    </a>
                  )}
                </div>

                {/* Linked accounts & contacts */}
                {(event.linkedAccounts.length > 0 || event.linkedContacts.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-(--border) grid grid-cols-1 md:grid-cols-2 gap-3">
                    {event.linkedAccounts.length > 0 && (
                      <div>
                        <div className="text-xs font-medium mb-1">Accounts</div>
                        <div className="space-y-1">
                          {event.linkedAccounts.map((a) => (
                            <div key={a.accountId} className="text-xs flex items-center gap-1.5">
                              <span>{a.accountName}</span>
                              <ConfidenceBadge confidence={a.matchConfidence} via={a.matchedVia} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {event.linkedContacts.length > 0 && (
                      <div>
                        <div className="text-xs font-medium mb-1">Contacts</div>
                        <div className="space-y-1">
                          {event.linkedContacts.map((c) => (
                            <div key={c.contactId} className="text-xs flex items-center gap-1.5">
                              <span>
                                {c.contactName} <span className="text-(--muted)">({c.attendeeEmail})</span>
                              </span>
                              <ConfidenceBadge confidence={c.matchConfidence} via={c.matchedVia} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pb-2 pr-4 text-left font-medium">User</th>
                <th className="pb-2 pr-4 text-left font-medium">Calendar</th>
                <th className="pb-2 pr-4 text-left font-medium">Has Token</th>
                <th className="pb-2 pr-4 text-left font-medium">Last Synced</th>
                <th className="pb-2 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {syncStates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-(--muted)">
                    No sync state yet. Run a sync to initialize.
                  </td>
                </tr>
              ) : (
                syncStates.map((s) => (
                  <tr key={s.id} className="border-b border-(--border)">
                    <td className="py-2 pr-4">{s.userName}</td>
                    <td className="py-2 pr-4 text-(--muted)">{s.calendarId}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${s.hasSyncToken ? "badge-completed" : "badge-pending"}`}>
                        {s.hasSyncToken ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{formatDate(s.lastSyncedAt)}</td>
                    <td className="py-2">
                      {s.lastSyncError ? (
                        <span className="text-(--destructive) text-xs truncate block max-w-xs">{s.lastSyncError}</span>
                      ) : (
                        <span className="text-(--muted)">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence, via }: { confidence: string; via: string | null }) {
  if (confidence === "auto_created") {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium"
        title={`Matched via: ${via || "auto-created"}`}
      >
        Auto
      </span>
    );
  }
  if (confidence === "low") {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium"
        title={`Matched via: ${via}`}
      >
        Low
      </span>
    );
  }
  return null;
}
