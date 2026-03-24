"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { IcpDefinition } from "@/lib/api-schemas/icp-definitions";
import type { AlphaFeed } from "@/lib/api-schemas/alpha-feed";
import { apiFetch, apiMutate } from "@/lib/api-client";
import {
  getIcpDefinitionsResponseSchema,
  createIcpDefinitionResponseSchema,
  patchIcpDefinitionResponseSchema,
} from "@/lib/api-schemas/icp-definitions";
import {
  getAlphaFeedResponseSchema,
  generateAlphaFeedSpecResponseSchema,
  collectAlphaFeedResponseSchema,
} from "@/lib/api-schemas/alpha-feed";
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

export function IcpSection({ accountId }: { accountId: string }) {
  const [icpDefs, setIcpDefs] = useState<IcpDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTitles, setNewTitles] = useState("");
  const [newIndustries, setNewIndustries] = useState("");
  const [newCompanySizes, setNewCompanySizes] = useState("");
  const [newSignals, setNewSignals] = useState("");

  // Alpha feed state
  const [alphaFeeds, setAlphaFeeds] = useState<Record<string, AlphaFeed | null>>({});
  const [loadingFeeds, setLoadingFeeds] = useState<Record<string, boolean>>({});
  const [generatingSpec, setGeneratingSpec] = useState<Record<string, boolean>>({});
  const [expandedFeed, setExpandedFeed] = useState<string | null>(null);
  const [addSageUrl, setAddSageUrl] = useState("");
  const [addSageName, setAddSageName] = useState("");
  const [addKeywordQuery, setAddKeywordQuery] = useState("");
  const [collecting, setCollecting] = useState<Record<string, boolean>>({});

  const fetchIcps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${accountId}/icp-definitions`, getIcpDefinitionsResponseSchema);
      setIcpDefs(data.icpDefinitions);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchIcps();
  }, [fetchIcps]);

  const fetchAlphaFeed = useCallback(
    async (icpId: string) => {
      setLoadingFeeds((prev) => ({ ...prev, [icpId]: true }));
      try {
        const data = await apiFetch(`/api/accounts/${accountId}/alpha-feed/${icpId}`, getAlphaFeedResponseSchema);
        setAlphaFeeds((prev) => ({ ...prev, [icpId]: data.alphaFeed }));
      } catch {
        // ignore
      } finally {
        setLoadingFeeds((prev) => ({ ...prev, [icpId]: false }));
      }
    },
    [accountId]
  );

  const toggleIcp = async (icpId: string, active: boolean) => {
    setIcpDefs((prev) => prev.map((d) => (d.id === icpId ? { ...d, active } : d)));
    try {
      await apiMutate(`/api/accounts/${accountId}/icp-definitions/${icpId}`, patchIcpDefinitionResponseSchema, {
        method: "PATCH",
        body: { active },
      });
    } catch {
      setIcpDefs((prev) => prev.map((d) => (d.id === icpId ? { ...d, active: !active } : d)));
    }
  };

  const createIcp = async () => {
    if (!newName.trim() || !newDescription.trim() || creating) return;
    setCreating(true);
    const splitCsv = (s: string) =>
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    try {
      await apiMutate(`/api/accounts/${accountId}/icp-definitions`, createIcpDefinitionResponseSchema, {
        method: "POST",
        body: {
          name: newName.trim(),
          description: newDescription.trim(),
          targetTitles: splitCsv(newTitles),
          targetIndustries: splitCsv(newIndustries),
          targetCompanySizes: splitCsv(newCompanySizes),
          targetSignals: splitCsv(newSignals),
        },
      });
      setNewName("");
      setNewDescription("");
      setNewTitles("");
      setNewIndustries("");
      setNewCompanySizes("");
      setNewSignals("");
      setShowCreate(false);
      await fetchIcps();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const generateSpec = async (icpId: string) => {
    setGeneratingSpec((prev) => ({ ...prev, [icpId]: true }));
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/generate`, generateAlphaFeedSpecResponseSchema, {
        method: "POST",
        body: {},
      });
    } catch {
      // ignore
    } finally {
      setGeneratingSpec((prev) => ({ ...prev, [icpId]: false }));
    }
  };

  const addSage = async (icpId: string) => {
    if (!addSageUrl.trim()) return;
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/sages`, getAlphaFeedResponseSchema, {
        method: "POST",
        body: { linkedinUrl: addSageUrl.trim(), displayName: addSageName.trim() || undefined },
      });
      setAddSageUrl("");
      setAddSageName("");
      fetchAlphaFeed(icpId);
    } catch {
      // toast handled
    }
  };

  const toggleSage = async (icpId: string, linkedinUrl: string, active: boolean) => {
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/sages`, getAlphaFeedResponseSchema, {
        method: "PATCH",
        body: { linkedinUrl, active },
      });
      fetchAlphaFeed(icpId);
    } catch {}
  };

  const removeSage = async (icpId: string, linkedinUrl: string) => {
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/sages`, getAlphaFeedResponseSchema, {
        method: "DELETE",
        body: { linkedinUrl },
      });
      fetchAlphaFeed(icpId);
    } catch {}
  };

  const addKeyword = async (icpId: string) => {
    if (!addKeywordQuery.trim()) return;
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/keywords`, getAlphaFeedResponseSchema, {
        method: "POST",
        body: { query: addKeywordQuery.trim() },
      });
      setAddKeywordQuery("");
      fetchAlphaFeed(icpId);
    } catch {}
  };

  const toggleKeyword = async (icpId: string, query: string, active: boolean) => {
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/keywords`, getAlphaFeedResponseSchema, {
        method: "PATCH",
        body: { query, active },
      });
      fetchAlphaFeed(icpId);
    } catch {}
  };

  const removeKeyword = async (icpId: string, query: string) => {
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/keywords`, getAlphaFeedResponseSchema, {
        method: "DELETE",
        body: { query },
      });
      fetchAlphaFeed(icpId);
    } catch {}
  };

  const collectFeed = async (icpId: string) => {
    setCollecting((prev) => ({ ...prev, [icpId]: true }));
    try {
      await apiMutate(`/api/accounts/${accountId}/alpha-feed/${icpId}/collect`, collectAlphaFeedResponseSchema, {
        method: "POST",
        body: {},
      });
    } catch {
      // toast handled
    } finally {
      setCollecting((prev) => ({ ...prev, [icpId]: false }));
    }
  };

  return (
    <SectionCard
      title="ICP Definitions"
      count={loading ? "..." : icpDefs.length}
      action={
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCreate(!showCreate);
          }}
          className="text-xs text-(--muted) hover:text-(--foreground) hover:underline"
        >
          {showCreate ? "Cancel" : "+ New ICP"}
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-(--muted)">Loading...</p>
      ) : icpDefs.length === 0 && !showCreate ? (
        <p className="text-sm text-(--muted)">No ICP definitions yet — create one to start scoring leads.</p>
      ) : (
        <div className="space-y-2">
          {icpDefs.map((icp) => (
            <div
              key={icp.id}
              className={`py-2 px-3 rounded bg-(--input) border border-(--border) ${!icp.active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {icp.name}
                    <span className={`badge ${icp.active ? "badge-completed" : "badge-neutral"}`}>
                      {icp.active ? "Active" : "Paused"}
                    </span>
                  </p>
                  <p className="text-xs text-(--muted) mt-0.5">{icp.description}</p>
                </div>
                <button
                  onClick={() => toggleIcp(icp.id, !icp.active)}
                  className={`text-xs hover:underline shrink-0 ml-3 ${icp.active ? "text-(--warning)" : "text-(--success)"}`}
                >
                  {icp.active ? "Pause" : "Resume"}
                </button>
              </div>
              {(icp.targetTitles.length > 0 ||
                icp.targetIndustries.length > 0 ||
                icp.targetCompanySizes.length > 0 ||
                icp.targetSignals.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {icp.targetTitles.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-(--accent)/20 text-(--accent)">
                      {t}
                    </span>
                  ))}
                  {icp.targetIndustries.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      {t}
                    </span>
                  ))}
                  {icp.targetCompanySizes.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                      {t} employees
                    </span>
                  ))}
                  {icp.targetSignals.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="mt-3 p-3 rounded bg-(--card) border border-(--border) space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-(--muted) mb-1">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Enterprise SaaS"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">Target Titles (comma-separated)</label>
              <input
                type="text"
                value={newTitles}
                onChange={(e) => setNewTitles(e.target.value)}
                placeholder="VP Marketing, Head of Growth, CMO"
                className="w-full text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-(--muted) mb-1">Description *</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="B2B SaaS companies with 50-500 employees..."
              rows={2}
              className="w-full text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-(--muted) mb-1">Industries</label>
              <input
                type="text"
                value={newIndustries}
                onChange={(e) => setNewIndustries(e.target.value)}
                placeholder="SaaS, Fintech"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">Company Sizes</label>
              <input
                type="text"
                value={newCompanySizes}
                onChange={(e) => setNewCompanySizes(e.target.value)}
                placeholder="20-200, 200-1000"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-(--muted) mb-1">Signals</label>
              <input
                type="text"
                value={newSignals}
                onChange={(e) => setNewSignals(e.target.value)}
                placeholder="Recently funded"
                className="w-full text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={createIcp}
              disabled={!newName.trim() || !newDescription.trim() || creating}
              className="btn-primary text-sm"
            >
              {creating ? "Creating..." : "Create ICP"}
            </button>
          </div>
        </div>
      )}

      {/* Alpha Feed Accordions */}
      {icpDefs.filter((icp) => icp.active).length > 0 && (
        <div className="mt-4 border-t border-(--border) pt-4">
          <h3 className="text-xs font-semibold text-(--muted) uppercase tracking-wide mb-3">Alpha Feed</h3>
          <div className="space-y-3">
            {icpDefs
              .filter((icp) => icp.active)
              .map((icp) => {
                const feed = alphaFeeds[icp.id];
                const isLoading = loadingFeeds[icp.id];
                const generating = generatingSpec[icp.id];
                const isExpanded = expandedFeed === icp.id;

                const handleExpand = () => {
                  const next = isExpanded ? null : icp.id;
                  setExpandedFeed(next);
                  if (next && !feed && !isLoading) fetchAlphaFeed(icp.id);
                };

                const sages = feed?.sages ?? [];
                const keywords = feed?.keywords ?? [];
                const dailyEntries = feed?.dailyEntries ?? {};
                const dateKeys = Object.keys(dailyEntries).sort().reverse();
                const totalEntries = dateKeys.reduce((sum, k) => sum + (dailyEntries[k]?.length ?? 0), 0);

                return (
                  <div key={icp.id} className="rounded bg-(--input) border border-(--border)">
                    <button
                      onClick={handleExpand}
                      className="w-full flex items-center justify-between py-2 px-3 text-left"
                    >
                      <span className="text-sm font-medium">
                        {icp.name}
                        <span className="text-xs text-(--muted) ml-2">
                          {sages.length} sages · {keywords.length} keywords
                          {totalEntries > 0 && ` · ${totalEntries} posts`}
                        </span>
                      </span>
                      <span className="text-xs text-(--muted)">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3">
                        {isLoading ? (
                          <p className="text-sm text-(--muted)">Loading...</p>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => generateSpec(icp.id)}
                                disabled={generating}
                                className="btn-primary text-xs"
                              >
                                {generating ? "Generating..." : "Generate Spec with AI"}
                              </button>
                              {feed && (sages.length > 0 || keywords.length > 0) && (
                                <button
                                  onClick={() => collectFeed(icp.id)}
                                  disabled={collecting[icp.id]}
                                  className="btn-primary text-xs"
                                >
                                  {collecting[icp.id] ? "Collecting..." : "Collect Now"}
                                </button>
                              )}
                              {!feed && (
                                <span className="text-xs text-(--muted)">
                                  No spec yet — generate one or add sages/keywords manually.
                                </span>
                              )}
                            </div>

                            {/* Sages */}
                            <div>
                              <p className="text-xs font-semibold text-(--muted) uppercase mb-1">Sages</p>
                              {sages.length === 0 ? (
                                <p className="text-xs text-(--muted)">No sages configured.</p>
                              ) : (
                                <div className="space-y-1">
                                  {sages.map((sage) => (
                                    <div
                                      key={sage.linkedinUrl}
                                      className={`flex items-center justify-between text-xs py-1 px-2 rounded bg-(--card) ${!sage.active ? "opacity-50" : ""}`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <a
                                          href={sage.linkedinUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium hover:underline"
                                        >
                                          {sage.displayName || sage.linkedinUrl}
                                        </a>
                                        {sage.headline && (
                                          <span className="text-(--muted) ml-1">&mdash; {sage.headline}</span>
                                        )}
                                        {sage.rationale && (
                                          <p className="text-(--muted) text-[10px] mt-0.5">{sage.rationale}</p>
                                        )}
                                      </div>
                                      <div className="flex gap-2 ml-2 shrink-0">
                                        <button
                                          onClick={() => toggleSage(icp.id, sage.linkedinUrl, !sage.active)}
                                          className={
                                            sage.active
                                              ? "text-(--warning) hover:underline"
                                              : "text-(--success) hover:underline"
                                          }
                                        >
                                          {sage.active ? "Pause" : "Resume"}
                                        </button>
                                        <button
                                          onClick={() => removeSage(icp.id, sage.linkedinUrl)}
                                          className="text-(--destructive) hover:underline"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-1 mt-1">
                                <input
                                  type="text"
                                  value={addSageUrl}
                                  onChange={(e) => setAddSageUrl(e.target.value)}
                                  placeholder="LinkedIn URL"
                                  className="w-32 text-xs"
                                />
                                <input
                                  type="text"
                                  value={addSageName}
                                  onChange={(e) => setAddSageName(e.target.value)}
                                  placeholder="Name (optional)"
                                  className="w-32 text-xs"
                                />
                                <button
                                  onClick={() => addSage(icp.id)}
                                  disabled={!addSageUrl.trim()}
                                  className="btn-primary text-xs px-2"
                                >
                                  Add
                                </button>
                              </div>
                            </div>

                            {/* Keywords */}
                            <div>
                              <p className="text-xs font-semibold text-(--muted) uppercase mb-1">Keywords</p>
                              {keywords.length === 0 ? (
                                <p className="text-xs text-(--muted)">No keywords configured.</p>
                              ) : (
                                <div className="space-y-1">
                                  {keywords.map((kw) => (
                                    <div
                                      key={kw.query}
                                      className={`flex items-center justify-between text-xs py-1 px-2 rounded bg-(--card) ${!kw.active ? "opacity-50" : ""}`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <span className="font-medium">&ldquo;{kw.query}&rdquo;</span>
                                        {kw.rationale && (
                                          <p className="text-(--muted) text-[10px] mt-0.5">{kw.rationale}</p>
                                        )}
                                      </div>
                                      <div className="flex gap-2 ml-2 shrink-0">
                                        <button
                                          onClick={() => toggleKeyword(icp.id, kw.query, !kw.active)}
                                          className={
                                            kw.active
                                              ? "text-(--warning) hover:underline"
                                              : "text-(--success) hover:underline"
                                          }
                                        >
                                          {kw.active ? "Pause" : "Resume"}
                                        </button>
                                        <button
                                          onClick={() => removeKeyword(icp.id, kw.query)}
                                          className="text-(--destructive) hover:underline"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-1 mt-1">
                                <input
                                  type="text"
                                  value={addKeywordQuery}
                                  onChange={(e) => setAddKeywordQuery(e.target.value)}
                                  placeholder="Search query"
                                  className="flex-1 text-xs"
                                />
                                <button
                                  onClick={() => addKeyword(icp.id)}
                                  disabled={!addKeywordQuery.trim()}
                                  className="btn-primary text-xs px-2"
                                >
                                  Add
                                </button>
                              </div>
                            </div>

                            {/* Daily entries */}
                            {dateKeys.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-(--muted) uppercase mb-1">Recent Feed</p>
                                {dateKeys.map((dateKey) => (
                                  <div key={dateKey} className="mb-3">
                                    <p className="text-xs text-(--muted) font-medium mb-1">
                                      {relativeDate(dateKey)} &mdash; {dateKey}
                                    </p>
                                    <div className="space-y-1.5">
                                      {(dailyEntries[dateKey] ?? []).map((entry, i) => (
                                        <div key={i} className="py-1.5 px-2 rounded bg-(--card) text-xs">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                              <p className="font-medium">
                                                {entry.authorName}
                                                {entry.authorHeadline && (
                                                  <span className="text-(--muted) font-normal">
                                                    {" "}
                                                    &mdash; {entry.authorHeadline}
                                                  </span>
                                                )}
                                              </p>
                                              <p className="text-(--muted) mt-0.5 line-clamp-3 whitespace-pre-line">
                                                {entry.content}
                                              </p>
                                            </div>
                                            <a
                                              href={entry.postUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-(--accent) hover:underline shrink-0"
                                            >
                                              View
                                            </a>
                                          </div>
                                          <div className="flex gap-3 mt-1 text-[10px] text-(--muted)">
                                            <span>{entry.likesCount} likes</span>
                                            <span>{entry.commentsCount} comments</span>
                                            <span>{entry.repostsCount} reposts</span>
                                            <span className="text-(--accent)">
                                              via {entry.sourceType === "sage" ? "sage" : "keyword"}:{" "}
                                              {entry.sourceLabel}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
