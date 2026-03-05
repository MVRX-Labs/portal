import { db } from "@/lib/db";
import {
  engagementProfiles,
  engagementPosts,
  engagementJobs,
  engagementRawResults,
} from "@/lib/schema";
import { eq, and, desc, inArray, notInArray } from "drizzle-orm";
import type { NormalizedPost } from "./engagement-bot";

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function createProfile(accountId: string, linkedinUrl: string, persona = "") {
  const [existing] = await db
    .select()
    .from(engagementProfiles)
    .where(and(eq(engagementProfiles.accountId, accountId), eq(engagementProfiles.linkedinUrl, linkedinUrl)));

  if (existing) return existing;

  const [profile] = await db
    .insert(engagementProfiles)
    .values({ accountId, linkedinUrl, engagementPersona: persona })
    .onConflictDoNothing()
    .returning();

  if (!profile) {
    // Race condition — return existing
    const [found] = await db
      .select()
      .from(engagementProfiles)
      .where(and(eq(engagementProfiles.accountId, accountId), eq(engagementProfiles.linkedinUrl, linkedinUrl)));
    return found;
  }

  return profile;
}

export async function bulkCreateProfiles(accountId: string, urls: string[], persona = "") {
  const created: (typeof engagementProfiles.$inferSelect)[] = [];
  for (const url of urls) {
    const profile = await createProfile(accountId, url, persona);
    if (profile) created.push(profile);
  }
  return created;
}

export async function listProfiles(accountId: string) {
  return db
    .select()
    .from(engagementProfiles)
    .where(eq(engagementProfiles.accountId, accountId))
    .orderBy(desc(engagementProfiles.createdAt));
}

export async function getProfile(profileId: string) {
  const [profile] = await db
    .select()
    .from(engagementProfiles)
    .where(eq(engagementProfiles.id, profileId));
  return profile ?? null;
}

export async function deleteProfile(profileId: string) {
  const [deleted] = await db
    .delete(engagementProfiles)
    .where(eq(engagementProfiles.id, profileId))
    .returning();
  return !!deleted;
}

export async function updateProfile(profileId: string, updates: Partial<typeof engagementProfiles.$inferInsert>) {
  const [updated] = await db
    .update(engagementProfiles)
    .set(updates)
    .where(eq(engagementProfiles.id, profileId))
    .returning();
  return updated ?? null;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ["engaged", "failed", "skip"];

export async function savePosts(profileId: string, normalizedPosts: NormalizedPost[]) {
  const newPosts: (typeof engagementPosts.$inferSelect)[] = [];
  let total = 0;

  for (const p of normalizedPosts) {
    if (!p.apifyPostId) continue;
    total++;

    const [inserted] = await db
      .insert(engagementPosts)
      .values({
        profileId,
        apifyPostId: p.apifyPostId,
        content: p.content,
        postUrl: p.postUrl,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        postedAt: p.postedAt,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) newPosts.push(inserted);
  }

  return { total, newPosts };
}

export async function updatePostStatus(postId: string, status: string, comment?: string) {
  const updates: Record<string, unknown> = { engagementStatus: status };
  if (comment !== undefined) updates.agentComment = comment;
  if (status === "engaged") updates.engagedAt = new Date();

  // Atomic conditional update — only transition if not already in a terminal state
  const [updated] = await db
    .update(engagementPosts)
    .set(updates)
    .where(
      and(
        eq(engagementPosts.id, postId),
        notInArray(engagementPosts.engagementStatus, TERMINAL_STATUSES),
      ),
    )
    .returning();

  if (!updated) {
    const [existing] = await db.select().from(engagementPosts).where(eq(engagementPosts.id, postId));
    if (!existing) return null;
    if (TERMINAL_STATUSES.includes(existing.engagementStatus)) {
      throw new Error(`Cannot transition from terminal state '${existing.engagementStatus}'`);
    }
    return null;
  }

  return updated;
}

export async function markPostSentToSlack(postId: string, slackTs: string) {
  await db
    .update(engagementPosts)
    .set({ engagementStatus: "sent_to_slack", slackMessageTs: slackTs })
    .where(and(eq(engagementPosts.id, postId), eq(engagementPosts.engagementStatus, "sending")));
}

/** Atomically claim unsent posts by transitioning pending → sending. Returns claimed rows. */
export async function claimUnsentPosts(profileId: string) {
  return db
    .update(engagementPosts)
    .set({ engagementStatus: "sending" })
    .where(and(eq(engagementPosts.profileId, profileId), eq(engagementPosts.engagementStatus, "pending")))
    .returning();
}

/** Revert claimed posts back to pending (e.g., on Slack send failure). */
export async function unclaimPost(postId: string) {
  await db
    .update(engagementPosts)
    .set({ engagementStatus: "pending" })
    .where(and(eq(engagementPosts.id, postId), eq(engagementPosts.engagementStatus, "sending")));
}

export async function getPost(postId: string) {
  const [post] = await db.select().from(engagementPosts).where(eq(engagementPosts.id, postId));
  return post ?? null;
}

export async function listPosts(accountId: string) {
  const profiles = await db
    .select({ id: engagementProfiles.id })
    .from(engagementProfiles)
    .where(eq(engagementProfiles.accountId, accountId));

  if (profiles.length === 0) return [];

  return db
    .select()
    .from(engagementPosts)
    .where(inArray(engagementPosts.profileId, profiles.map((p) => p.id)))
    .orderBy(desc(engagementPosts.postedAt));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function createJob(profileId: string, accountId: string) {
  const [job] = await db
    .insert(engagementJobs)
    .values({ profileId, accountId })
    .returning();
  return job;
}

export async function updateJob(jobId: string, updates: Partial<typeof engagementJobs.$inferInsert>) {
  const [updated] = await db
    .update(engagementJobs)
    .set(updates)
    .where(eq(engagementJobs.id, jobId))
    .returning();
  return updated ?? null;
}

export async function listJobs(accountId: string) {
  return db
    .select()
    .from(engagementJobs)
    .where(eq(engagementJobs.accountId, accountId))
    .orderBy(desc(engagementJobs.createdAt));
}

// ---------------------------------------------------------------------------
// Raw results
// ---------------------------------------------------------------------------

export async function saveRawResults(
  jobId: string,
  profileId: string,
  rawItems: Record<string, unknown>[],
) {
  for (const item of rawItems) {
    const apifyItemId = (item.urn as string) || (item.url as string) || "";
    if (!apifyItemId) continue;

    await db
      .insert(engagementRawResults)
      .values({ jobId, profileId, apifyItemId, rawData: item })
      .onConflictDoNothing();
  }
}
