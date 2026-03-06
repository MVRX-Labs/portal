/**
 * Post analytics — tracks OUR CLIENTS' LinkedIn profile performance.
 *
 * managed_profiles = our clients' LinkedIn accounts (e.g., Will Fairbairn, Romil Depala)
 * managed_posts = posts from those profiles
 * managed_post_snapshots = engagement snapshots over time
 *
 * NOT to be confused with engagement_profiles (external people to engage WITH).
 */

import { db } from "@/lib/db";
import {
  managedProfiles,
  managedPosts,
  managedPostSnapshots,
} from "@/lib/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createObjectId } from "./ids";

// ---------------------------------------------------------------------------
// Profile management
// ---------------------------------------------------------------------------

export async function addManagedProfile(
  accountId: string,
  linkedinUrl: string,
  displayName: string,
  linkedinSlug?: string,
) {
  const [existing] = await db
    .select()
    .from(managedProfiles)
    .where(and(eq(managedProfiles.accountId, accountId), eq(managedProfiles.linkedinUrl, linkedinUrl)));

  if (existing) {
    await db
      .update(managedProfiles)
      .set({ displayName, linkedinSlug, updatedAt: new Date() })
      .where(eq(managedProfiles.id, existing.id));
    return existing;
  }

  const [profile] = await db
    .insert(managedProfiles)
    .values({ accountId, linkedinUrl, displayName, linkedinSlug })
    .returning();
  return profile;
}

export async function listManagedProfiles(accountId: string) {
  return db
    .select()
    .from(managedProfiles)
    .where(and(eq(managedProfiles.accountId, accountId), eq(managedProfiles.active, true)))
    .orderBy(managedProfiles.displayName);
}

export async function getManagedProfile(profileId: string) {
  const [profile] = await db
    .select()
    .from(managedProfiles)
    .where(eq(managedProfiles.id, profileId));
  return profile ?? null;
}

// ---------------------------------------------------------------------------
// Apify scrape → ingest posts + snapshots
// ---------------------------------------------------------------------------

interface ApifyPost {
  apifyPostId: string;
  content: string;
  postUrl: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  postedAt: Date | null;
}

export function normalizeApifyPost(raw: Record<string, unknown>): ApifyPost | null {
  const urn = (raw.urn as string) || (raw.id as string) || (raw.postId as string) || "";
  if (!urn) return null;

  let postedAt: Date | null = null;
  const ts = raw.postedAtTimestamp as number | undefined;
  if (ts) {
    postedAt = new Date(ts > 1e12 ? ts : ts * 1000);
  } else {
    const iso = raw.postedAtISO as string | undefined;
    if (iso) {
      const d = new Date(iso.replace("Z", "+00:00"));
      if (!isNaN(d.getTime())) postedAt = d;
    }
  }

  return {
    apifyPostId: urn,
    content: ((raw.text as string) || (raw.commentary as string) || "").slice(0, 500),
    postUrl: (raw.postUrl as string) || (raw.url as string) || "",
    likesCount: (raw.numLikes as number) || 0,
    commentsCount: (raw.numComments as number) || 0,
    repostsCount: (raw.numShares as number) || 0,
    postedAt,
  };
}

export async function ingestPosts(
  profileId: string,
  accountId: string,
  rawPosts: Record<string, unknown>[],
): Promise<{ total: number; newCount: number }> {
  const posts = rawPosts.map(normalizeApifyPost).filter((p): p is ApifyPost => p !== null);

  let newCount = 0;
  for (const p of posts) {
    // Upsert post
    const [existing] = await db
      .select()
      .from(managedPosts)
      .where(and(eq(managedPosts.profileId, profileId), eq(managedPosts.apifyPostId, p.apifyPostId)));

    let postId: string;
    if (existing) {
      await db
        .update(managedPosts)
        .set({
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
          repostsCount: p.repostsCount,
          content: p.content || existing.content,
          postUrl: p.postUrl || existing.postUrl,
        })
        .where(eq(managedPosts.id, existing.id));
      postId = existing.id;
    } else {
      const [newPost] = await db
        .insert(managedPosts)
        .values({
          profileId,
          accountId,
          apifyPostId: p.apifyPostId,
          content: p.content,
          postUrl: p.postUrl,
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
          repostsCount: p.repostsCount,
          postedAt: p.postedAt,
        })
        .returning();
      postId = newPost.id;
      newCount++;
    }

    // Take snapshot
    await db.insert(managedPostSnapshots).values({
      postId,
      profileId,
      accountId,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      repostsCount: p.repostsCount,
    });
  }

  // Update lastScrapedAt
  await db
    .update(managedProfiles)
    .set({ lastScrapedAt: new Date(), updatedAt: new Date() })
    .where(eq(managedProfiles.id, profileId));

  return { total: posts.length, newCount };
}

// ---------------------------------------------------------------------------
// Growth queries
// ---------------------------------------------------------------------------

export interface PostDelta {
  postId: string;
  content: string;
  postUrl: string;
  postedAt: Date | null;
  currentLikes: number;
  currentComments: number;
  currentReposts: number;
  deltaLikes: number;
  deltaComments: number;
  deltaReposts: number;
  deltaTotal: number;
  hasDelta: boolean;
}

export async function getPostDeltas(profileId: string): Promise<PostDelta[]> {
  const posts = await db
    .select()
    .from(managedPosts)
    .where(eq(managedPosts.profileId, profileId))
    .orderBy(desc(managedPosts.likesCount));

  const results: PostDelta[] = [];

  for (const post of posts) {
    const snapshots = await db
      .select({
        likesCount: managedPostSnapshots.likesCount,
        commentsCount: managedPostSnapshots.commentsCount,
        repostsCount: managedPostSnapshots.repostsCount,
      })
      .from(managedPostSnapshots)
      .where(eq(managedPostSnapshots.postId, post.id))
      .orderBy(desc(managedPostSnapshots.capturedAt))
      .limit(2);

    let deltaLikes = 0, deltaComments = 0, deltaReposts = 0;
    let hasDelta = false;

    if (snapshots.length >= 2) {
      const [curr, prev] = snapshots;
      deltaLikes = curr.likesCount - prev.likesCount;
      deltaComments = curr.commentsCount - prev.commentsCount;
      deltaReposts = curr.repostsCount - prev.repostsCount;
      hasDelta = true;
    }

    results.push({
      postId: post.id,
      content: post.content,
      postUrl: post.postUrl,
      postedAt: post.postedAt,
      currentLikes: post.likesCount,
      currentComments: post.commentsCount,
      currentReposts: post.repostsCount,
      deltaLikes,
      deltaComments,
      deltaReposts,
      deltaTotal: deltaLikes + deltaComments + deltaReposts,
      hasDelta,
    });
  }

  return results;
}

export interface ProfileGrowth {
  profileId: string;
  displayName: string;
  linkedinUrl: string;
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  totalEngagement: number;
  deltaLikes: number;
  deltaComments: number;
  deltaReposts: number;
  deltaTotal: number;
  postsWithGrowth: number;
  snapshotCount: number;
  hasComparison: boolean;
  lastScrapedAt: Date | null;
}

export async function getProfileGrowth(profileId: string): Promise<ProfileGrowth> {
  const [profile] = await db
    .select()
    .from(managedProfiles)
    .where(eq(managedProfiles.id, profileId));

  const posts = await db
    .select()
    .from(managedPosts)
    .where(eq(managedPosts.profileId, profileId));

  const totalLikes = posts.reduce((s, p) => s + p.likesCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentsCount, 0);
  const totalReposts = posts.reduce((s, p) => s + p.repostsCount, 0);

  const deltas = await getPostDeltas(profileId);
  const deltaLikes = deltas.reduce((s, d) => s + d.deltaLikes, 0);
  const deltaComments = deltas.reduce((s, d) => s + d.deltaComments, 0);
  const deltaReposts = deltas.reduce((s, d) => s + d.deltaReposts, 0);
  const postsWithGrowth = deltas.filter((d) => d.hasDelta && d.deltaTotal > 0).length;

  let snapshotCount = 0;
  if (posts.length > 0) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(managedPostSnapshots)
      .where(eq(managedPostSnapshots.postId, posts[0].id));
    snapshotCount = Number(countResult?.count ?? 0);
  }

  return {
    profileId,
    displayName: profile?.displayName ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    totalPosts: posts.length,
    totalLikes,
    totalComments,
    totalReposts,
    totalEngagement: totalLikes + totalComments + totalReposts,
    deltaLikes,
    deltaComments,
    deltaReposts,
    deltaTotal: deltaLikes + deltaComments + deltaReposts,
    postsWithGrowth,
    snapshotCount,
    hasComparison: snapshotCount >= 2,
    lastScrapedAt: profile?.lastScrapedAt ?? null,
  };
}

export async function getAccountGrowth(accountId: string) {
  const profiles = await listManagedProfiles(accountId);

  const growths: ProfileGrowth[] = [];
  for (const p of profiles) {
    growths.push(await getProfileGrowth(p.id));
  }

  const totalPosts = growths.reduce((s, g) => s + g.totalPosts, 0);
  const totalEngagement = growths.reduce((s, g) => s + g.totalEngagement, 0);
  const deltaTotal = growths.reduce((s, g) => s + g.deltaTotal, 0);
  const hasComparison = growths.some((g) => g.hasComparison);

  return {
    profiles: growths,
    totals: { totalPosts, totalEngagement, deltaTotal, hasComparison },
  };
}
