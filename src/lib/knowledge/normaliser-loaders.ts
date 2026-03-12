/**
 * Knowledge Hub — Data loaders for normalisation.
 *
 * Loads account context, open items, and dedup data from the DB.
 * Extracted from normaliser.ts to keep files under 300 lines.
 */

import { db } from "@/lib/db";
import { knowledgeUnits, contacts, accounts } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import type { AccountContext, OpenItem, ExtractedSummary } from "./prompts";

export async function loadAccountContext(accountId: string): Promise<AccountContext> {
  const [account] = await db.select({ name: accounts.name, slug: accounts.slug }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const accountContacts = await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.accountId, accountId));
  return {
    slug: account?.slug ?? "unknown",
    name: account?.name ?? "Unknown",
    contacts: accountContacts.map((c) => ({ name: c.name, side: "client" as const })),
  };
}

export async function loadAllAccountsBatched(): Promise<AccountContext[]> {
  const allAccounts = await db.select({ id: accounts.id, name: accounts.name, slug: accounts.slug }).from(accounts);
  const allContacts = await db.select({ name: contacts.name, accountId: contacts.accountId }).from(contacts);
  const contactsByAccount = new Map<string, string[]>();
  for (const c of allContacts) {
    if (!contactsByAccount.has(c.accountId)) contactsByAccount.set(c.accountId, []);
    contactsByAccount.get(c.accountId)!.push(c.name);
  }
  return allAccounts.map((a) => ({
    slug: a.slug,
    name: a.name,
    contacts: (contactsByAccount.get(a.id) ?? []).map((name) => ({ name, side: "client" as const })),
  }));
}

export async function loadOpenItems(accountId: string): Promise<OpenItem[]> {
  const items = await db
    .select({ id: knowledgeUnits.id, content: knowledgeUnits.content, assignee: knowledgeUnits.assignee, unitType: knowledgeUnits.unitType })
    .from(knowledgeUnits)
    .where(and(eq(knowledgeUnits.accountId, accountId), eq(knowledgeUnits.status, "open")));
  return items.map((i) => ({ id: i.id, content: i.content, assignee: i.assignee, type: i.unitType }));
}

export async function loadExistingSummaries(channelId: string): Promise<ExtractedSummary[]> {
  const existing = await db
    .select({ type: knowledgeUnits.unitType, content: knowledgeUnits.content, assignee: knowledgeUnits.assignee, status: knowledgeUnits.status })
    .from(knowledgeUnits)
    .where(eq(knowledgeUnits.channelId, channelId));
  return existing.map((u) => ({ type: u.type, content: u.content, assignee: u.assignee, status: u.status }));
}

export async function loadExistingForDedup(
  channelId: string,
  accountId: string | null,
): Promise<Array<{ content: string; assignee: string | null }>> {
  const conditions = [eq(knowledgeUnits.channelId, channelId)];
  if (accountId) conditions.push(eq(knowledgeUnits.accountId, accountId));
  return db.select({ content: knowledgeUnits.content, assignee: knowledgeUnits.assignee }).from(knowledgeUnits).where(and(...conditions));
}

export function chunkEvents<T>(events: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < events.length; i += size) chunks.push(events.slice(i, i + size));
  return chunks;
}
