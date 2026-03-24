"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Action } from "@/lib/api-schemas/actions";
import { apiFetch, apiMutate } from "@/lib/api-client";
import {
  getActionsResponseSchema,
  createActionResponseSchema,
  updateActionResponseSchema,
  deleteActionResponseSchema,
} from "@/lib/api-schemas/actions";
import { SectionCard } from "./section-card";

function relativeDate(iso: string | null): string {
  if (!iso) return "No data";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 0) return "Today";
    if (absDays === 1) return "Tomorrow";
    if (absDays < 7) return `In ${absDays}d`;
    return `In ${Math.floor(absDays / 7)}w`;
  }
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function dueDateStyle(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < now ? "text-(--destructive)" : "text-(--muted)";
}

export function ActionsSection({ accountId }: { accountId: string }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${accountId}/actions`, getActionsResponseSchema);
      setActions(data.actions);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const addAction = async () => {
    if (!title.trim() || adding) return;
    setAdding(true);
    try {
      await apiMutate(`/api/accounts/${accountId}/actions`, createActionResponseSchema, {
        method: "POST",
        body: { title: title.trim(), dueDate: dueDate || null },
      });
      setTitle("");
      setDueDate("");
      await fetchActions();
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const completeAction = async (actionId: string) => {
    try {
      await apiMutate(`/api/accounts/${accountId}/actions/${actionId}`, updateActionResponseSchema, {
        method: "PUT",
        body: { status: "completed" },
      });
      await fetchActions();
    } catch {
      // ignore
    }
  };

  const deleteAction = async (actionId: string) => {
    try {
      await apiMutate(`/api/accounts/${accountId}/actions/${actionId}`, deleteActionResponseSchema, {
        method: "DELETE",
      });
      await fetchActions();
    } catch {
      // ignore
    }
  };

  return (
    <SectionCard title="Pending Actions" count={loading ? "..." : actions.length}>
      {loading ? (
        <p className="text-sm text-(--muted)">Loading...</p>
      ) : (
        <>
          {actions.length === 0 && <p className="text-sm text-(--muted) mb-3">No pending actions</p>}
          <div className="space-y-2 mb-3">
            {actions.map((action) => (
              <div
                key={action.id}
                className="flex items-center gap-2 py-2 px-3 rounded bg-(--input) border border-(--border)"
              >
                <span className="text-sm flex-1 truncate">{action.title}</span>
                {action.dueDate && (
                  <span className={`text-xs ${dueDateStyle(action.dueDate)} whitespace-nowrap`}>
                    Due {relativeDate(action.dueDate)}
                  </span>
                )}
                <span className="badge badge-pending">{action.status}</span>
                <button
                  onClick={() => completeAction(action.id)}
                  className="text-xs text-(--success) hover:underline shrink-0"
                >
                  Done
                </button>
                <button
                  onClick={() => deleteAction(action.id)}
                  className="text-xs text-(--destructive) hover:underline shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAction()}
              placeholder="Add an action..."
              className="min-w-0"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAction()}
              className="text-sm min-w-0 max-w-full"
              title="Due date (optional)"
            />
            <button
              onClick={addAction}
              disabled={!title.trim() || adding}
              className="btn-primary text-sm whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
