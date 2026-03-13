/**
 * Knowledge Hub — Action sync.
 *
 * Automatically creates account_actions from actionable knowledge units
 * (action_item, request, blocker, deliverable). Bridges the knowledge
 * extraction pipeline with the manual account to-do list.
 */

import { db } from "@/lib/db";
import { accountActions, users } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import type { KnowledgeUnitType } from "./types";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

const ACTIONABLE_TYPES: Set<string> = new Set([
  "action_item",
  "request",
  "blocker",
  "deliverable",
]);

interface UnitRow {
  id: string;
  accountId: string | null;
  unitType: string | KnowledgeUnitType;
  content: string;
  assignee: string | null;
  status: string;
  dueDate: Date | null;
}

/**
 * Extract the first sentence from content, capped at maxLen characters.
 * Used to derive a concise action title from the full unit content.
 */
function deriveTitle(content: string, maxLen = 100): string {
  // Split on sentence-ending punctuation followed by whitespace
  const firstSentence = content.split(/(?<=[.!?])\s/)[0] ?? content;
  if (firstSentence.length <= maxLen) return firstSentence;
  return firstSentence.slice(0, maxLen - 1) + "…";
}

/**
 * Fuzzy-match an assignee name to a users.id.
 * Uses the same matching strategy as validation.ts findByName.
 */
function resolveAssigneeToUserId(
  assigneeName: string,
  allUsers: Array<{ id: string; name: string }>,
): string | null {
  const nameLower = assigneeName.toLowerCase().trim();

  // Exact match
  const exact = allUsers.find((u) => u.name.toLowerCase() === nameLower);
  if (exact) return exact.id;

  // First-name match (only if name is long enough to avoid false positives)
  if (nameLower.length > 3) {
    const firstName = nameLower.split(/\s+/)[0];
    if (firstName.length > 3) {
      const match = allUsers.find((u) => u.name.toLowerCase().split(/\s+/)[0] === firstName);
      if (match) return match.id;
    }
  }

  // Substring match (only if search name is long enough)
  if (nameLower.length > 4) {
    const match = allUsers.find((u) => {
      const uLower = u.name.toLowerCase();
      return uLower.includes(nameLower) || nameLower.includes(uLower);
    });
    if (match) return match.id;
  }

  return null;
}

/**
 * Sync actionable knowledge units to account_actions.
 *
 * For each unit that is an actionable type (action_item, request, blocker,
 * deliverable), creates a corresponding account action if one doesn't already
 * exist (keyed by sourceUnitId to prevent duplicates).
 *
 * Skips units without an accountId and units with status "done".
 */
export async function syncUnitsToActions(units: UnitRow[], logger: Logger): Promise<number> {
  const actionable = units.filter(
    (u) => ACTIONABLE_TYPES.has(u.unitType) && u.accountId && u.status !== "done",
  );

  if (actionable.length === 0) return 0;

  // Check which units already have linked actions (avoid duplicates)
  const unitIds = actionable.map((u) => u.id);
  const existingSet = new Set<string>();
  if (unitIds.length > 0) {
    const rows = await db
      .select({ sourceUnitId: accountActions.sourceUnitId })
      .from(accountActions)
      .where(inArray(accountActions.sourceUnitId, unitIds));
    for (const row of rows) {
      if (row.sourceUnitId) existingSet.add(row.sourceUnitId);
    }
  }

  const toCreate = actionable.filter((u) => !existingSet.has(u.id));
  if (toCreate.length === 0) return 0;

  // Preload users for assignee resolution
  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);

  let created = 0;
  for (const unit of toCreate) {
    const assigneeId = unit.assignee
      ? resolveAssigneeToUserId(unit.assignee, allUsers)
      : null;

    try {
      await db.insert(accountActions).values({
        accountId: unit.accountId!,
        title: deriveTitle(unit.content),
        description: unit.content,
        status: "pending",
        dueDate: unit.dueDate,
        assigneeId,
        sourceUnitId: unit.id,
      }).onConflictDoNothing();
      created++;
    } catch (err) {
      // Non-fatal: one failed action shouldn't block others
      logger.error(
        `Failed to create action for unit ${unit.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (created > 0) {
    logger.info(`Synced ${created} knowledge unit(s) to account actions`);
  }

  return created;
}

/**
 * Mark the account action linked to a knowledge unit as completed.
 * Called when a ✅ reaction marks a unit as done.
 * Returns true if a linked action was found and updated.
 */
export async function markLinkedActionCompleted(unitId: string): Promise<boolean> {
  const [action] = await db
    .select({ id: accountActions.id })
    .from(accountActions)
    .where(eq(accountActions.sourceUnitId, unitId))
    .limit(1);

  if (!action) return false;

  await db
    .update(accountActions)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(accountActions.id, action.id));

  return true;
}

/**
 * Reopen the account action linked to a knowledge unit.
 * Called when a ✅ reaction is removed, reopening the unit.
 * Returns true if a linked action was found and updated.
 */
export async function reopenLinkedAction(unitId: string): Promise<boolean> {
  const [action] = await db
    .select({ id: accountActions.id })
    .from(accountActions)
    .where(eq(accountActions.sourceUnitId, unitId))
    .limit(1);

  if (!action) return false;

  await db
    .update(accountActions)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(accountActions.id, action.id));

  return true;
}
