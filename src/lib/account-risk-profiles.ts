/**
 * Account Risk Profiles — orchestration layer for risk evaluation.
 *
 * Calls the per-subsystem signal functions from account-risk-signals.ts
 * and combines them into overall risk profiles for paying accounts.
 */

import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  getCalendarRiskSignals,
  getKnowledgeRiskSignals,
  getLinkedinRiskSignals,
  getActionRiskSignals,
  evaluateOverallRisk,
  type AccountRiskProfile,
  type OverallRisk,
} from "@/lib/account-risk-signals";

/**
 * Evaluate all paying, non-hidden accounts and return sorted risk profiles.
 * Sorted by risk level (high → healthy), then by MRR descending within each tier.
 */
export async function getAllAccountRiskProfiles(): Promise<AccountRiskProfile[]> {
  const payingAccounts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
    })
    .from(accounts)
    .where(and(gt(accounts.mrr, 0), eq(accounts.hidden, false)));

  const profiles: AccountRiskProfile[] = [];

  for (const account of payingAccounts) {
    const [calendarSignals, knowledgeSignals, linkedinSignals, actionSignals] = await Promise.all([
      getCalendarRiskSignals(account.id),
      getKnowledgeRiskSignals(account.id),
      getLinkedinRiskSignals(account.id),
      getActionRiskSignals(account.id),
    ]);

    const signals = [...calendarSignals, ...knowledgeSignals, ...linkedinSignals, ...actionSignals];

    profiles.push({
      accountId: account.id,
      accountName: account.name,
      mrr: account.mrr,
      mrrCurrency: account.mrrCurrency,
      signals,
      overallRisk: evaluateOverallRisk(signals),
    });
  }

  const riskOrder: Record<OverallRisk, number> = { high: 0, medium: 1, low: 2, healthy: 3 };
  profiles.sort((a, b) => riskOrder[a.overallRisk] - riskOrder[b.overallRisk] || b.mrr - a.mrr);

  return profiles;
}

/**
 * Evaluate a single account's risk profile.
 */
export async function getAccountRiskProfile(accountId: string): Promise<AccountRiskProfile | null> {
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      mrr: accounts.mrr,
      mrrCurrency: accounts.mrrCurrency,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) return null;

  const [calendarSignals, knowledgeSignals, linkedinSignals, actionSignals] = await Promise.all([
    getCalendarRiskSignals(account.id),
    getKnowledgeRiskSignals(account.id),
    getLinkedinRiskSignals(account.id),
    getActionRiskSignals(account.id),
  ]);

  const signals = [...calendarSignals, ...knowledgeSignals, ...linkedinSignals, ...actionSignals];

  return {
    accountId: account.id,
    accountName: account.name,
    mrr: account.mrr,
    mrrCurrency: account.mrrCurrency,
    signals,
    overallRisk: evaluateOverallRisk(signals),
  };
}
