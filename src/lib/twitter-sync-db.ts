/**
 * DB helpers for the twitter_posts table.
 */

import { db } from "@/lib/db";
import { twitterPosts, twitterProfiles } from "@/lib/schema";
import { eq, and, notInArray } from "drizzle-orm";

const TERMINAL_STATUSES = ["engaged", "failed", "skip"];

export async function getTwitterPost(postId: string) {
  const [post] = await db.select().from(twitterPosts).where(eq(twitterPosts.id, postId));
  return post ?? null;
}

export async function getTwitterPostProfile(profileId: string) {
  const [profile] = await db.select().from(twitterProfiles).where(eq(twitterProfiles.id, profileId));
  return profile ?? null;
}

/**
 * Atomic conditional update for engagement workflow status.
 * Only transitions if not already in a terminal state (engaged, failed, skip).
 */
export async function updateTwitterPostStatus(postId: string, status: string, comment?: string) {
  const updates: Record<string, unknown> = { engagementStatus: status };
  if (comment !== undefined) updates.agentComment = comment;
  if (status === "engaged") updates.engagedAt = new Date();

  const [updated] = await db
    .update(twitterPosts)
    .set(updates)
    .where(and(eq(twitterPosts.id, postId), notInArray(twitterPosts.engagementStatus, TERMINAL_STATUSES)))
    .returning();

  if (!updated) {
    const [existing] = await db.select().from(twitterPosts).where(eq(twitterPosts.id, postId));
    if (!existing) return null;
    if (existing.engagementStatus && TERMINAL_STATUSES.includes(existing.engagementStatus)) {
      throw new Error(`Cannot transition from terminal state '${existing.engagementStatus}'`);
    }
    return null;
  }

  return updated;
}
