"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { TimelineEvent, GetTimelineResponse } from "@/lib/api-schemas/timeline";
import { getTimelineResponseSchema } from "@/lib/api-schemas/timeline";
import { apiFetch } from "@/lib/api-client";

const TYPE_CONFIG: Record<
  TimelineEvent["type"],
  { icon: string; color: string; label: string }
> = {
  meeting: { icon: "\u{1F4C5}", color: "border-l-blue-500", label: "Meeting" },
  knowledge_event: { icon: "\u{1F4AC}", color: "border-l-purple-500", label: "Knowledge" },
  linkedin_post: { icon: "\u{1F4DD}", color: "border-l-sky-500", label: "LinkedIn" },
  lead: { icon: "\u{1F464}", color: "border-l-green-500", label: "Lead" },
  action: { icon: "\u2611\uFE0F", color: "border-l-amber-500", label: "Action" },
  tool_run: { icon: "\u2699\uFE0F", color: "border-l-gray-500", label: "Tool Run" },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

function MeetingCard({ event }: { event: TimelineEvent & { type: "meeting" } }) {
  return (
    <div>
      <p className="text-sm font-medium">{event.title || "Untitled meeting"}</p>
      {event.attendees.length > 0 && (
        <p className="text-xs text-(--muted) mt-0.5">
          With {event.attendees.join(", ")}
        </p>
      )}
      {event.htmlLink && (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-(--accent) hover:underline mt-0.5 inline-block"
        >
          Open in Calendar
        </a>
      )}
    </div>
  );
}

function KnowledgeCard({ event }: { event: TimelineEvent & { type: "knowledge_event" } }) {
  return (
    <div>
      <p className="text-xs text-(--muted)">
        {event.authorName || "Unknown"} in{" "}
        <span className="font-medium">#{event.channelName || "channel"}</span>
      </p>
      <p className="text-sm mt-0.5">{event.contentPreview}</p>
    </div>
  );
}

function LinkedinPostCard({ event }: { event: TimelineEvent & { type: "linkedin_post" } }) {
  return (
    <div>
      <p className="text-xs text-(--muted)">{event.profileName}</p>
      <p className="text-sm mt-0.5">{event.contentSnippet}</p>
      <div className="flex items-center gap-3 mt-1 text-xs text-(--muted)">
        <span>{event.likesCount} likes</span>
        <span>{event.commentsCount} comments</span>
        <span>{event.repostsCount} reposts</span>
        {event.postUrl && (
          <a
            href={event.postUrl}
            target="_blank"
            rel="noreferrer"
            className="text-(--accent) hover:underline"
          >
            View post
          </a>
        )}
      </div>
    </div>
  );
}

function LeadCard({ event }: { event: TimelineEvent & { type: "lead" } }) {
  const name = [event.firstName, event.lastName].filter(Boolean).join(" ");
  return (
    <div>
      <p className="text-sm font-medium">{name}</p>
      {event.headline && (
        <p className="text-xs text-(--muted) mt-0.5">{event.headline}</p>
      )}
      <a
        href={event.linkedinUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-(--accent) hover:underline mt-0.5 inline-block"
      >
        View profile
      </a>
    </div>
  );
}

function ActionCard({ event }: { event: TimelineEvent & { type: "action" } }) {
  return (
    <div>
      <p className="text-sm font-medium">{event.title}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="badge badge-neutral text-xs">{event.status}</span>
        {event.dueDate && (
          <span className="text-xs text-(--muted)">
            Due {new Date(event.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolRunCard({ event }: { event: TimelineEvent & { type: "tool_run" } }) {
  const statusBadge =
    event.status === "completed"
      ? "badge-completed"
      : event.status === "failed"
        ? "badge-failed"
        : "badge-running";
  return (
    <div>
      <p className="text-sm font-medium">{event.tool}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className={`badge ${statusBadge} text-xs`}>{event.status}</span>
        {event.outputUrl && (
          <a
            href={event.outputUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-(--accent) hover:underline"
          >
            View output
          </a>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: TimelineEvent }) {
  switch (event.type) {
    case "meeting":
      return <MeetingCard event={event} />;
    case "knowledge_event":
      return <KnowledgeCard event={event} />;
    case "linkedin_post":
      return <LinkedinPostCard event={event} />;
    case "lead":
      return <LeadCard event={event} />;
    case "action":
      return <ActionCard event={event} />;
    case "tool_run":
      return <ToolRunCard event={event} />;
  }
}

export function TimelinePanel({ accountId }: { accountId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTimeline = useCallback(
    async (before?: string) => {
      const isMore = !!before;
      if (isMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const qs = before ? `?limit=20&before=${encodeURIComponent(before)}` : "?limit=20";
        const data: GetTimelineResponse = await apiFetch(
          `/api/accounts/${accountId}/timeline${qs}`,
          getTimelineResponseSchema
        );
        if (isMore) {
          setEvents((prev) => [...prev, ...data.events]);
        } else {
          setEvents(data.events);
        }
        setNextCursor(data.nextCursor);
      } catch {
        // handled by apiFetch toast
      } finally {
        if (isMore) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [accountId]
  );

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  return (
    <div className="border-t border-(--border) pt-4 mb-4">
      <h3 className="text-sm font-semibold text-(--muted) uppercase tracking-wide mb-3">
        Activity Timeline
      </h3>
      {loading ? (
        <p className="text-sm text-(--muted)">Loading timeline...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-(--muted)">No activity recorded yet</p>
      ) : (
        <div className="space-y-0">
          {events.map((event) => {
            const cfg = TYPE_CONFIG[event.type];
            return (
              <div
                key={event.id}
                className={`flex gap-3 py-2 px-3 border-l-2 ${cfg.color} bg-(--input) rounded-r mb-1.5`}
              >
                <span className="text-base leading-none mt-0.5" title={cfg.label}>
                  {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <EventCard event={event} />
                </div>
                <span className="text-xs text-(--muted) whitespace-nowrap shrink-0 mt-0.5">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            );
          })}
          {nextCursor && (
            <button
              onClick={() => fetchTimeline(nextCursor)}
              disabled={loadingMore}
              className="btn-secondary text-sm w-full mt-2"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
