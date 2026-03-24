"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "./section-card";
import { z } from "zod";

const leadsResponseSchema = z.object({
  leads: z.array(z.any()),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});

const leadCsvsResponseSchema = z.object({
  csvs: z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      leadCount: z.number(),
      contactName: z.string().nullable(),
      profileName: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});

type LeadCsv = z.infer<typeof leadCsvsResponseSchema>["csvs"][number];

export function LeadsSummarySection({ accountId }: { accountId: string }) {
  const [totalLeads, setTotalLeads] = useState(0);
  const [recentCsvs, setRecentCsvs] = useState<LeadCsv[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsData, csvsData] = await Promise.all([
        apiFetch(`/api/accounts/${accountId}/leads?limit=1`, leadsResponseSchema),
        apiFetch(`/api/accounts/${accountId}/leads/csvs?limit=5`, leadCsvsResponseSchema),
      ]);
      setTotalLeads(leadsData.pagination.total);
      setRecentCsvs(csvsData.csvs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <SectionCard title="Leads" count={loading ? "..." : totalLeads}>
      {loading ? (
        <p className="text-sm text-(--muted)">Loading...</p>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-3">
            <div className="text-sm">
              <span className="font-medium">{totalLeads}</span> <span className="text-(--muted)">leads discovered</span>
            </div>
          </div>

          {recentCsvs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-(--muted) uppercase tracking-wide mb-2">Recent Exports</p>
              <div className="space-y-1">
                {recentCsvs.map((csv) => (
                  <div
                    key={csv.id}
                    className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-(--input) border border-(--border)"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{csv.filename}</span>
                      <span className="text-(--muted) ml-2">
                        {csv.leadCount} leads
                        {csv.contactName && ` · ${csv.contactName}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-(--muted)">{new Date(csv.createdAt).toLocaleDateString()}</span>
                      <a
                        href={`/api/accounts/${accountId}/leads/csvs/${csv.id}/download`}
                        className="text-(--accent) hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
