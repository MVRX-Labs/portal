/**
 * DB helpers for the unified linkedin_posts table.
 * Mirrors the engagement-bot-db.ts patterns for the new schema.
 */

import { db } from "@/lib/db";
import { linkedinPosts, linkedinProfiles } from "@/lib/schema";
import { eq, and, notInArray } from "drizzle-orm";

const TERMINAL_STATUSES = ["engaged", "failed", "skip"];

export async function getLinkedinPost(postId: string) {
  const [post] = await db.select().from(linkedinPosts).where(eq(linkedinPosts.id, postId));
  return post ?? null;
}

export async function getLinkedinPostProfile(profileId: string) {
  const [profile] = await db.select().from(linkedinProfiles).where(eq(linkedinProfiles.id, profileId));
  return profile ?? null;
}

/**
 * Atomic conditional update for engagement workflow status.
 * Only transitions if not already in a terminal state (engaged, failed, skip).
 */
export async function updateLinkedinPostStatus(postId: string, status: string, comment?: string) {
  const updates: Record<string, unknown> = { engagementStatus: status };
  if (comment !== undefined) updates.agentComment = comment;
  if (status === "engaged") updates.engagedAt = new Date();

  const [updated] = await db
    .update(linkedinPosts)
    .set(updates)
    .where(and(eq(linkedinPosts.id, postId), notInArray(linkedinPosts.engagementStatus, TERMINAL_STATUSES)))
    .returning();

  if (!updated) {
    const [existing] = await db.select().from(linkedinPosts).where(eq(linkedinPosts.id, postId));
    if (!existing) return null;
    if (existing.engagementStatus && TERMINAL_STATUSES.includes(existing.engagementStatus)) {
      throw new Error(`Cannot transition from terminal state '${existing.engagementStatus}'`);
    }
    return null;
  }

  return updated;
}
