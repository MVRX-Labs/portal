"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "@/components/account-provider";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { getUnitsResponseSchema, patchUnitResponseSchema, type Unit } from "@/lib/api-schemas/knowledge";

const TYPE_EMOJI: Record<string, string> = {
  action_item: "🔹",
  decision: "⚖️",
  request: "📩",
  blocker: "🚫",
  deliverable: "📦",
  feedback: "💬",
  context_update: "📝",
  content_draft: "✍️",
  product_bug: "🐛",
  product_feature: "✨",
};

const UNIT_TYPES = [
  "action_item",
  "decision",
  "context_update",
  "content_draft",
  "request",
  "feedback",
  "deliverable",
  "blocker",
  "product_bug",
  "product_feature",
];

interface Filters {
  type: string;
  status: string;
  page: number;
}

export default function KnowledgeUnitsPage() {
  const { account } = useAccount();

  const [units, setUnits] = useState<Unit[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState<Filters>({ type: "", status: "", page: 1 });
  const [loading, setLoading] = useState(true);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editForm, setEditForm] = useState({ content: "", status: "", assignee: "" });

  const loadUnits = useCallback(async () => {
    if (!account) {
      setUnits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    params.set("accountId", account.id);
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    params.set("page", String(filters.page));
    params.set("limit", "50");

    try {
      const res = await apiFetch(`/api/knowledge/units?${params}`, getUnitsResponseSchema);
      setUnits(res.units);
      setPagination(res.pagination);
    } catch {
      // handled by toast
    } finally {
      setLoading(false);
    }
  }, [account, filters]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const handleStatusChange = async (unitId: string, status: string) => {
    try {
      await apiMutate(`/api/knowledge/units/${unitId}`, patchUnitResponseSchema, {
        method: "PATCH",
        body: { status },
      });
      loadUnits();
    } catch {
      // handled by toast
    }
  };

  const openEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setEditForm({
      content: unit.content,
      status: unit.status,
      assignee: unit.assignee ?? "",
    });
  };

  const handleEditSave = async () => {
    if (!editingUnit) return;
    try {
      const body: Record<string, unknown> = {};
      if (editForm.content !== editingUnit.content) body.content = editForm.content;
      if (editForm.status !== editingUnit.status) body.status = editForm.status;
      if (editForm.assignee !== (editingUnit.assignee ?? "")) body.assignee = editForm.assignee || null;

      if (Object.keys(body).length > 0) {
        await apiMutate(`/api/knowledge/units/${editingUnit.id}`, patchUnitResponseSchema, {
          method: "PATCH",
          body,
        });
      }
      setEditingUnit(null);
      loadUnits();
    } catch {
      // handled by toast
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Knowledge Units</h1>
        <p className="text-(--muted)">Select an account to browse knowledge units.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Units</h1>
          <p className="text-sm text-(--muted)">
            {account.name} — {pagination.total} total units
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-(--muted) mb-1">Type</label>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}>
              <option value="">All types</option>
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_EMOJI[t]} {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Units list */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border) text-left text-(--muted)">
              <th className="pb-2 pr-3 font-medium">Type</th>
              <th className="pb-2 pr-3 font-medium">Content</th>
              <th className="pb-2 pr-3 font-medium">Assignee</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium">Conf.</th>
              <th className="pb-2 pr-3 font-medium">Channel</th>
              <th className="pb-2 pr-3 font-medium">Created</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-(--muted)">
                  Loading...
                </td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-(--muted)">
                  No units found
                </td>
              </tr>
            ) : (
              units.map((unit) => (
                <tr key={unit.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span title={unit.unitType}>{TYPE_EMOJI[unit.unitType] ?? "🔹"}</span>
                    <span className="ml-1 text-xs text-(--muted)">{unit.unitType.replace(/_/g, " ")}</span>
                  </td>
                  <td className="py-2 pr-3 max-w-sm">
                    <p className="truncate" title={unit.content}>
                      {unit.content}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">{unit.assignee ?? "-"}</td>
                  <td className="py-2 pr-3">
                    <span className={`badge ${unit.status === "open" ? "badge-pending" : "badge-completed"}`}>
                      {unit.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">{unit.confidence}%</td>
                  <td className="py-2 pr-3 text-xs text-(--muted) font-mono">
                    {unit.channelName ? `#${unit.channelName}` : "-"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-(--muted) whitespace-nowrap">{fmtDate(unit.createdAt)}</td>
                  <td className="py-2 whitespace-nowrap">
                    {unit.status === "open" && (
                      <>
                        <button
                          onClick={() => handleStatusChange(unit.id, "done")}
                          className="btn-secondary text-xs mr-1"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => handleStatusChange(unit.id, "dismissed")}
                          className="btn-secondary text-xs mr-1"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                    {unit.status === "done" && (
                      <button
                        onClick={() => handleStatusChange(unit.id, "open")}
                        className="btn-secondary text-xs mr-1"
                      >
                        Reopen
                      </button>
                    )}
                    <button onClick={() => openEdit(unit)} className="btn-secondary text-xs">
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-(--border)">
            <p className="text-xs text-(--muted)">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page <= 1}
                className="btn-secondary text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page >= pagination.totalPages}
                className="btn-secondary text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingUnit && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Edit Unit</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <textarea
                  rows={4}
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Assignee</label>
                <input
                  value={editForm.assignee}
                  onChange={(e) => setEditForm({ ...editForm, assignee: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingUnit(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleEditSave} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
