"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Briefing {
  account_summary: string;
  key_contacts: Array<{ name: string; role?: string; notes: string }>;
  recent_activity_highlights: string[];
  talking_points: string[];
  suggested_agenda: string[];
  risk_flags: string[];
}

interface MeetingPrep {
  id: string;
  eventId: string;
  accountId: string;
  userId: string;
  briefingJson: Briefing | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: "badge-completed",
    generating: "badge-running",
    pending: "badge-pending",
    failed: "badge badge-neutral",
  };
  return <span className={`badge ${styles[status] || "badge-neutral"}`}>{status}</span>;
}

function TalkingPointCard({ point, index }: { point: string; index: number }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-(--input) border border-(--border)">
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-(--primary) text-(--primary-foreground) text-sm font-bold shrink-0">
        {index + 1}
      </span>
      <p className="text-sm leading-relaxed">{point}</p>
    </div>
  );
}

function ContactCard({ contact }: { contact: Briefing["key_contacts"][0] }) {
  return (
    <div className="p-3 rounded-lg bg-(--input) border border-(--border)">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-sm">{contact.name}</span>
        {contact.role && <span className="text-xs text-(--muted)">({contact.role})</span>}
      </div>
      <p className="text-xs text-(--muted) leading-relaxed">{contact.notes}</p>
    </div>
  );
}

function PrepContent({ prep }: { prep: MeetingPrep }) {
  const briefing = prep.briefingJson;

  if (!briefing) {
    return (
      <div className="card p-6 text-center">
        <p className="text-(--muted)">Briefing data is not available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Summary */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-2">Account Summary</h2>
        <p className="text-sm leading-relaxed">{briefing.account_summary}</p>
      </div>

      {/* Talking Points */}
      <div>
        <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3">Talking Points</h2>
        <div className="space-y-2">
          {briefing.talking_points.map((point, i) => (
            <TalkingPointCard key={i} point={point} index={i} />
          ))}
        </div>
      </div>

      {/* Two-column: Contacts + Agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Contacts */}
        <div>
          <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3">Key Contacts</h2>
          {briefing.key_contacts.length > 0 ? (
            <div className="space-y-2">
              {briefing.key_contacts.map((contact, i) => (
                <ContactCard key={i} contact={contact} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">No contacts identified.</p>
          )}
        </div>

        {/* Suggested Agenda */}
        <div>
          <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3">Suggested Agenda</h2>
          {briefing.suggested_agenda.length > 0 ? (
            <div className="space-y-2">
              {briefing.suggested_agenda.map((item, i) => (
                <div key={i} className="flex gap-2 p-3 rounded-lg bg-(--input) border border-(--border)">
                  <span className="text-sm text-(--muted) shrink-0">{i + 1}.</span>
                  <p className="text-sm">{item}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">No agenda items suggested.</p>
          )}
        </div>
      </div>

      {/* Recent Activity Highlights */}
      {briefing.recent_activity_highlights.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3">Recent Activity</h2>
          <div className="space-y-2">
            {briefing.recent_activity_highlights.map((highlight, i) => (
              <div key={i} className="flex gap-2 p-3 rounded-lg bg-(--input) border border-(--border)">
                <span className="text-sm shrink-0">•</span>
                <p className="text-sm">{highlight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Flags */}
      {briefing.risk_flags.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3">Risk Flags</h2>
          <div className="space-y-2">
            {briefing.risk_flags.map((risk, i) => (
              <div key={i} className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-sm shrink-0">⚠</span>
                <p className="text-sm text-red-400">{risk}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MeetingPrepPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [prep, setPrep] = useState<MeetingPrep | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fetchPrep = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${eventId}/prep`);
      if (res.ok) {
        const data = await res.json();
        setPrep(data.prep);
        setError(null);
      } else if (res.status === 404) {
        setPrep(null);
        setError(null);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to load meeting prep");
      }
    } catch {
      setError("Failed to load meeting prep");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchPrep();
  }, [fetchPrep]);

  // Poll while generating
  useEffect(() => {
    if (!prep || prep.status !== "generating") return;
    const interval = setInterval(fetchPrep, 5000);
    return () => clearInterval(interval);
  }, [prep, fetchPrep]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/meetings/${eventId}/prep`, { method: "POST" });
      if (res.ok) {
        setPrep((prev) => (prev ? { ...prev, status: "generating" } : prev));
        setTimeout(fetchPrep, 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to regenerate");
      }
    } catch {
      setError("Failed to regenerate meeting prep");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Meeting Prep</h1>
        <p className="text-(--muted)">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Meeting Prep</h1>
        <div className="flex items-center gap-3">
          {prep && <StatusBadge status={prep.status} />}
          <button
            onClick={handleRegenerate}
            disabled={regenerating || prep?.status === "generating"}
            className="btn-secondary text-sm"
          >
            {regenerating || prep?.status === "generating" ? "Generating..." : "Regenerate"}
          </button>
        </div>
      </div>
      <p className="text-sm text-(--muted) mb-6">
        AI-generated briefing for your upcoming meeting
        {prep && (
          <span className="ml-2">
            — Last updated {new Date(prep.updatedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}
          </span>
        )}
      </p>

      {error && (
        <div className="card p-4 mb-6 border-red-500/20 bg-red-500/10">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!prep && !error && (
        <div className="card p-8 text-center">
          <p className="text-(--muted) mb-4">No meeting prep has been generated for this event yet.</p>
          <button onClick={handleRegenerate} disabled={regenerating} className="btn-primary text-sm">
            {regenerating ? "Generating..." : "Generate Meeting Prep"}
          </button>
        </div>
      )}

      {prep?.status === "generating" && (
        <div className="card p-8 text-center">
          <p className="text-(--muted) mb-2">Your meeting prep briefing is being generated...</p>
          <p className="text-xs text-(--muted)">This typically takes 15-30 seconds. The page will update automatically.</p>
        </div>
      )}

      {prep?.status === "failed" && (
        <div className="card p-6 text-center border-red-500/20 bg-red-500/10">
          <p className="text-red-400 mb-3">Meeting prep generation failed.</p>
          <button onClick={handleRegenerate} disabled={regenerating} className="btn-primary text-sm">
            {regenerating ? "Regenerating..." : "Try Again"}
          </button>
        </div>
      )}

      {prep?.status === "ready" && <PrepContent prep={prep} />}
    </div>
  );
}
