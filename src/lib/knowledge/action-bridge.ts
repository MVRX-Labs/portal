/**
 * Knowledge Hub → Account Actions bridge.
 *
 * Automatically creates account actions from actionable knowledge units
 * (action_item, request, blocker, deliverable) so that AI-extracted tasks
 * from Slack conversations appear directly in the account actions list.
 */

import { db } from "@/lib/db";
import { accountActions, users } from "@/lib/schema";
import { eq } from "drizzle-orm";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

/** Unit types that should be bridged to account actions. */
export const ACTIONABLE_UNIT_TYPES = ["action_item", "request", "blocker", "deliverable"] as const;

interface BridgeUnit {
  id: string;
  accountId: string | null;
  unitType: string;
  content: string;
  assignee: string | null;
  status: string;
  dueDate: Date | null;
}

/**
 * Create an account action from a knowledge unit if one doesn't already exist.
 * Skips units without an accountId (can't create an action without an account).
 */
export async function createActionFromUnit(
  unit: BridgeUnit,
  logger: Logger,
): Promise<void> {
  if (!unit.accountId) return;

  // Check if an action already exists for this knowledge unit
  const [existing] = await db
    .select({ id: accountActions.id })
    .from(accountActions)
    .where(eq(accountActions.knowledgeUnitId, unit.id))
    .limit(1);

  if (existing) return;

  // Resolve assignee name to a user ID
  const assigneeId = unit.assignee ? await resolveAssigneeToUserId(unit.assignee) : null;

  // Map unit status to action status
  const status = unit.status === "done" ? "completed" : "pending";

  const title = unit.content.length > 200 ? unit.content.slice(0, 197) + "..." : unit.content;

  await db.insert(accountActions).values({
    accountId: unit.accountId,
    title,
    description: unit.content,
    status,
    dueDate: unit.dueDate,
    assigneeId,
    knowledgeUnitId: unit.id,
  });

  logger.info(`Created action from knowledge unit ${unit.id} for account ${unit.accountId}`);
}

/**
 * Resolve an assignee name string to a users.id using the same matching
 * strategy as findByName in validation.ts.
 */
async function resolveAssigneeToUserId(name: string): Promise<string | null> {
  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const match = findByName(allUsers, name);
  return match?.id ?? null;
}

/** Find a person by name match from a preloaded list (mirrors validation.ts logic). */
function findByName<T extends { name: string }>(list: T[], name: string): T | null {
  const nameLower = name.toLowerCase().trim();

  const exact = list.find((item) => item.name.toLowerCase() === nameLower);
  if (exact) return exact;

  if (nameLower.length > 3) {
    const firstName = nameLower.split(/\s+/)[0];
    if (firstName.length > 3) {
      const firstNameMatch = list.find((item) => item.name.toLowerCase().split(/\s+/)[0] === firstName);
      if (firstNameMatch) return firstNameMatch;
    }
  }

  if (nameLower.length > 4) {
    return list.find((item) => {
      const itemLower = item.name.toLowerCase();
      return itemLower.includes(nameLower) || nameLower.includes(itemLower);
    }) ?? null;
  }

  return null;
}
