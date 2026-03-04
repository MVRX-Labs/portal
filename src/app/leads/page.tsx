"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
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
  const [contactFilter, setContactFilter] = useState(
    searchParams.get("contactId") || ""
  );
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(1);
  const scrapingRef = useRef(false);

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
      const res = await fetch(
        `/api/accounts/${account.id}/leads?${params}`
      );
      const data = await res.json();
      setLeads(data.leads || []);
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
    window.open(
      `/api/accounts/${account.id}/leads/export${qs ? `?${qs}` : ""}`,
      "_blank"
    );
  };

  const handleScrape = async () => {
    if (!account || scraping || scrapingRef.current) return;
    scrapingRef.current = true;
    setScraping(true);
    setScrapeStatus(null);

    try {
      const res = await fetch(
        `/api/accounts/${account.id}/leads/scrape`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(contactFilter ? { contactId: contactFilter } : {}),
            daysBack,
          }),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        setScrapeStatus(data.error || "Failed to trigger scrape");
      } else {
        const labels = (data.sources || []).map(
          (s: { sourceType: string; linkedinUrl: string }) =>
            `${s.sourceType === "company" ? "Company" : "Personal"}: ${s.linkedinUrl}`
        );
        setScrapeStatus(
          `Scraping ${labels.join(", ")}. Results will appear here shortly.`
        );
      }
    } catch {
      setScrapeStatus("Failed to trigger scrape");
    } finally {
      scrapingRef.current = false;
      setScraping(false);
    }
  };

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Leads</h1>
        <p className="text-sm text-[var(--muted)]">
          Select an account from the sidebar to view leads.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex gap-2 items-center">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="text-sm w-32"
          >
            <option value={1}>Last 1 day</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={handleScrape}
            disabled={scraping}
            className="btn-secondary text-sm"
          >
            {scraping ? "Triggering..." : "Run Scrape"}
          </button>
          <button onClick={handleExport} className="btn-primary text-sm">
            Export CSV
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        People who engaged with {account.name}&apos;s LinkedIn content
        {pagination ? ` \u2014 ${pagination.total} total` : ""}
      </p>

      {scrapeStatus && (
        <div className="text-sm px-3 py-2 mb-4 rounded bg-[var(--input)] border border-[var(--border)]">
          {scrapeStatus}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads..."
          className="w-64"
        />
        <select
          value={contactFilter}
          onChange={(e) => setContactFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All Sources</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Headline</th>
              <th className="pb-2 pr-4 font-medium">Company</th>
              <th className="pb-2 pr-4 font-medium">Engagement</th>
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 pr-4 font-medium">First Seen</th>
              <th className="pb-2 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-[var(--muted)]"
                >
                  Loading...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-[var(--muted)]"
                >
                  No leads found
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-2 pr-4">
                    <a
                      href={lead.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      {lead.firstName}
                      {lead.lastName ? ` ${lead.lastName}` : ""}
                    </a>
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate">
                    {lead.headline || "\u2014"}
                  </td>
                  <td className="py-2 pr-4">{lead.company || "\u2014"}</td>
                  <td className="py-2 pr-4">
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
                  <td className="py-2 pr-4 text-[var(--muted)]">
                    {lead.contactName || "Company Page"}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-[var(--muted)]">
                    {formatDate(lead.firstSeenAt)}
                  </td>
                  <td className="py-2 whitespace-nowrap text-[var(--muted)]">
                    {formatDate(lead.lastSeenAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => navigate(page - 1)}
            disabled={page <= 1}
            className="btn-secondary"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--muted)]">
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
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={<div className="text-[var(--muted)]">Loading...</div>}
    >
      <LeadsContent />
    </Suspense>
  );
}
