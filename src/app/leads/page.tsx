"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import type { GetLeadsResponse, LeadCsv, GetLeadCsvsResponse } from "@/lib/api-schemas/leads";
import { getLeadsResponseSchema, scrapeLeadsResponseSchema, getLeadCsvsResponseSchema } from "@/lib/api-schemas/leads";
import { apiFetch, apiMutate } from "@/lib/api-client";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "@/components/account-provider";

interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  linkedinUrl: string;
  headline: string | null;
  company: string | null;
  profileImageUrl: string | null;
  engagementTypes: string[];
  contactId: string | null;
  contactName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { account, contacts } = useAccount();

  const page = parseInt(searchParams.get("page") || "1", 10);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [contactFilter, setContactFilter] = useState(searchParams.get("contactId") || "");
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(1);
  const scrapingRef = useRef(false);
  const [tab, setTab] = useState<"leads" | "csvs">("leads");
  const [csvs, setCsvs] = useState<LeadCsv[]>([]);
  const [csvPagination, setCsvPagination] = useState<Pagination | null>(null);
  const [csvsLoading, setCsvsLoading] = useState(false);

  const fetchLeads = useCallback(async () => {
    if (!account) {
      setLeads([]);
      setPagination(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (search) params.set("q", search);
    if (contactFilter) params.set("contactId", contactFilter);

    try {
      const data = await apiFetch(`/api/accounts/${account.id}/leads?${params}`, getLeadsResponseSchema);
      setLeads((data.leads || []) as Lead[]);
      setPagination(data.pagination || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [account, page, search, contactFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const fetchCsvs = useCallback(async () => {
    if (!account) return;
    setCsvsLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${account.id}/leads/csvs?page=1&limit=50`, getLeadCsvsResponseSchema);
      setCsvs((data.csvs || []) as LeadCsv[]);
      setCsvPagination(data.pagination || null);
    } catch {
      // ignore
    } finally {
      setCsvsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (tab === "csvs") fetchCsvs();
  }, [tab, fetchCsvs]);

  const navigate = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/leads?${params}`);
  };

  const handleExport = () => {
    if (!account) return;
    const params = new URLSearchParams();
    if (contactFilter) params.set("contactId", contactFilter);
    const qs = params.toString();
    window.open(`/api/accounts/${account.id}/leads/export${qs ? `?${qs}` : ""}`, "_blank");
  };

  const handleScrape = async () => {
    if (!account || scraping || scrapingRef.current) return;
    scrapingRef.current = true;
    setScraping(true);
    setScrapeStatus(null);

    try {
      const data = await apiMutate(`/api/accounts/${account.id}/leads/scrape`, scrapeLeadsResponseSchema, {
        method: "POST",
        body: {
          ...(contactFilter ? { contactId: contactFilter } : {}),
          daysBack,
        },
      });
      const labels = (data.profiles || []).map((p) => p.displayName || p.linkedinUrl);
      setScrapeStatus(`Scraping ${labels.join(", ")}. Results will appear here shortly.`);
    } catch (err) {
      setScrapeStatus(err instanceof Error ? err.message : "Failed to trigger scrape");
    } finally {
      scrapingRef.current = false;
      setScraping(false);
    }
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Leads</h1>
        <p className="text-sm text-(--muted)">Select an account from the sidebar to view leads.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex gap-2 items-center">
          <select value={daysBack} onChange={(e) => setDaysBack(Number(e.target.value))} className="text-sm w-32">
            <option value={1}>Last 1 day</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button onClick={handleScrape} disabled={scraping} className="btn-secondary text-sm">
            {scraping ? "Triggering..." : "Run Scrape"}
          </button>
          <button onClick={handleExport} className="btn-primary text-sm">
            Export CSV
          </button>
        </div>
      </div>
      <p className="text-sm text-(--muted) mb-4">
        People who engaged with {account.name}&apos;s LinkedIn content
        {pagination ? ` \u2014 ${pagination.total} total` : ""}
      </p>

      {scrapeStatus && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-(--input) border border-(--border)">{scrapeStatus}</div>
      )}

      <div className="flex gap-1 mb-4 border-b border-(--border)">
        <button
          onClick={() => setTab("leads")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "leads" ? "border-(--accent) text-white" : "border-transparent text-(--muted) hover:text-white"
          }`}
        >
          All Leads{pagination ? ` (${pagination.total})` : ""}
        </button>
        <button
          onClick={() => setTab("csvs")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "csvs" ? "border-(--accent) text-white" : "border-transparent text-(--muted) hover:text-white"
          }`}
        >
          CSV Reports{csvPagination ? ` (${csvPagination.total})` : ""}
        </button>
      </div>

      {tab === "leads" && (
        <>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-64"
            />
            <select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)} className="w-48">
              <option value="">All Sources</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border) text-left text-(--muted)">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Headline</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Engagement</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">First Seen</th>
                  <th className="px-3 py-2 font-medium">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-(--muted)">
                      Loading...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-(--muted)">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-(--border) last:border-0">
                      <td className="px-3 py-1.5">
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-(--accent) hover:underline"
                        >
                          {lead.firstName}
                          {lead.lastName ? ` ${lead.lastName}` : ""}
                        </a>
                      </td>
                      <td className="px-3 py-1.5 max-w-xs truncate">{lead.headline || "\u2014"}</td>
                      <td className="px-3 py-1.5">{lead.company || "\u2014"}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex gap-1 flex-wrap">
                          {(lead.engagementTypes || []).map((type) => (
                            <span
                              key={type}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-(--muted)">{lead.contactName || "Company Page"}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-(--muted)">{formatDate(lead.firstSeenAt)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-(--muted)">{formatDate(lead.lastSeenAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button onClick={() => navigate(page - 1)} disabled={page <= 1} className="btn-secondary">
                Previous
              </button>
              <span className="text-sm text-(--muted)">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => navigate(page + 1)}
                disabled={page >= pagination.totalPages}
                className="btn-secondary"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {tab === "csvs" && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border) text-left text-(--muted)">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Window</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Leads</th>
                <th className="px-3 py-2 font-medium">Posts</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {csvsLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-(--muted)">
                    Loading...
                  </td>
                </tr>
              ) : csvs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-(--muted)">
                    No CSV reports yet
                  </td>
                </tr>
              ) : (
                csvs.map((csv) => (
                  <tr key={csv.id} className="border-b border-(--border) last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-(--muted)">{formatDate(csv.createdAt)}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${
                          csv.scrapeWindow === "early"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-orange-500/20 text-orange-400"
                        }`}
                      >
                        {csv.scrapeWindow}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">{csv.profileName || csv.contactName || "\u2014"}</td>
                    <td className="px-3 py-1.5">{csv.leadCount}</td>
                    <td className="px-3 py-1.5">{(csv.postUrls || []).length}</td>
                    <td className="px-3 py-1.5 max-w-xs truncate text-(--muted)">{csv.description}</td>
                    <td className="px-3 py-1.5">
                      <a
                        href={`/api/accounts/${account.id}/leads/csvs/${csv.id}/download`}
                        className="text-(--accent) hover:underline text-sm"
                      >
                        Download
                      </a>
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

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="text-(--muted)">Loading...</div>}>
      <LeadsContent />
    </Suspense>
  );
}
