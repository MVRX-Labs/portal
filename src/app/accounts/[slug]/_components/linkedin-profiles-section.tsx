"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { LinkedinProfile } from "@/lib/api-schemas/linkedin-profiles";
import { apiFetch, apiMutate } from "@/lib/api-client";
import {
  getLinkedinProfilesResponseSchema,
  patchLinkedinProfileResponseSchema,
} from "@/lib/api-schemas/linkedin-profiles";
import { SectionCard } from "./section-card";

export function LinkedinProfilesSection({ accountId }: { accountId: string }) {
  const [profiles, setProfiles] = useState<LinkedinProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${accountId}/linkedin-profiles`, getLinkedinProfilesResponseSchema);
      setProfiles(data.profiles);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const toggleFlag = async (
    profileId: string,
    flag: "inboundEnabled" | "analyticsEnabled" | "outboundEnabled",
    value: boolean
  ) => {
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, [flag]: value } : p)));
    try {
      await apiMutate(`/api/accounts/${accountId}/linkedin-profiles/${profileId}`, patchLinkedinProfileResponseSchema, {
        method: "PATCH",
        body: { [flag]: value },
      });
    } catch {
      setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, [flag]: !value } : p)));
    }
  };

  return (
    <SectionCard title="LinkedIn Profiles" count={loading ? "..." : profiles.length}>
      {loading ? (
        <p className="text-sm text-(--muted)">Loading...</p>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-(--muted)">No LinkedIn profiles tracked yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border) text-left text-(--muted)">
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="px-3 py-1.5 font-medium">LinkedIn URL</th>
                <th className="px-3 py-1.5 font-medium">Source</th>
                <th className="px-3 py-1.5 font-medium text-center">Inbound</th>
                <th className="px-3 py-1.5 font-medium text-center">Analytics</th>
                <th className="px-3 py-1.5 font-medium text-center">Outbound</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-(--border) last:border-0">
                  <td className="px-3 py-1.5">{p.displayName || "\u2014"}</td>
                  <td className="px-3 py-1.5">
                    <a
                      href={p.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-(--accent) hover:underline truncate block max-w-xs"
                    >
                      {p.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\//, "")}
                    </a>
                  </td>
                  <td className="px-3 py-1.5 text-(--muted)">{p.sourceType === "company" ? "Company" : "Personal"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={p.inboundEnabled}
                      onChange={(e) => toggleFlag(p.id, "inboundEnabled", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={p.analyticsEnabled}
                      onChange={(e) => toggleFlag(p.id, "analyticsEnabled", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={p.outboundEnabled}
                      onChange={(e) => toggleFlag(p.id, "outboundEnabled", e.target.checked)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
