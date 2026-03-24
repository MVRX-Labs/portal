"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import type { Account } from "@/lib/api-schemas/accounts";
import type { User } from "@/lib/api-schemas/admin";
import { apiFetch } from "@/lib/api-client";
import { getAccountResponseSchema } from "@/lib/api-schemas/accounts";
import { getUsersResponseSchema } from "@/lib/api-schemas/admin";
import Link from "next/link";

import { AccountHeader } from "./_components/account-header";
import { ContactsSection } from "./_components/contacts-section";
import { ActionsSection } from "./_components/actions-section";
import { LinkedinProfilesSection } from "./_components/linkedin-profiles-section";
import { IcpSection } from "./_components/icp-section";
import { IntegrationsSection } from "./_components/integrations-section";
import { ContentVoiceSection } from "./_components/content-voice-section";
import { KnowledgeStateSection } from "./_components/knowledge-state-section";
import { LeadsSummarySection } from "./_components/leads-summary-section";

function AccountOverviewContent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [account, setAccount] = useState<Account | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      // Fetch account without apiFetch to avoid toast on 404
      const acctRes = await fetch(`/api/accounts/${slug}`);
      if (acctRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (!acctRes.ok) throw new Error(`HTTP ${acctRes.status}`);
      const acctJson = await acctRes.json();
      const acctData = getAccountResponseSchema.parse(acctJson);

      const userData = await apiFetch("/api/admin/users", getUsersResponseSchema);
      setAccount(acctData.account);
      setUsers(userData.users);
    } catch {
      // ignore — toast handled
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAccountUpdated = (updates: Partial<Account>) => {
    setAccount((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  if (loading) {
    return <div className="text-(--muted)">Loading account...</div>;
  }

  if (notFound || !account) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold mb-2">Account not found</h1>
        <p className="text-sm text-(--muted) mb-4">No account with slug &ldquo;{slug}&rdquo; exists.</p>
        <Link href="/accounts" className="text-(--accent) hover:underline text-sm">
          Back to accounts
        </Link>
      </div>
    );
  }

  return (
    <div>
      <AccountHeader account={account} users={users} onAccountUpdated={handleAccountUpdated} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ContactsSection accountId={account.id} />
        <ActionsSection accountId={account.id} />
      </div>

      <div className="space-y-4">
        <LinkedinProfilesSection accountId={account.id} />
        <IcpSection accountId={account.id} />
        <IntegrationsSection account={account} onAccountUpdated={handleAccountUpdated} />
        <ContentVoiceSection
          accountId={account.id}
          initialVoice={account.contentVoiceGuidance}
          initialNotes={account.notes}
          initialCalendarUrl={account.contentCalendarUrl || null}
          initialContractLinks={account.contractLinks || []}
          onSaved={handleAccountUpdated}
        />
        <KnowledgeStateSection accountId={account.id} />
        <LeadsSummarySection accountId={account.id} />
      </div>
    </div>
  );
}

export default function AccountOverviewPage() {
  return (
    <Suspense fallback={<div className="text-(--muted)">Loading...</div>}>
      <AccountOverviewContent />
    </Suspense>
  );
}
