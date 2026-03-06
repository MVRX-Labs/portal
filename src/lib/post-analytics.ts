/**
 * Post analytics — snapshot tracking + growth queries.
 *
 * Takes a snapshot of each post's engagement on every scrape.
 * Computes deltas (current vs previous snapshot) for growth reports.
 */

import { db } from "@/lib/db";
import {
  engagementPosts,
  engagementProfiles,
  postSnapshots,
  analyticsReports,
} from "@/lib/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createObjectId } from "./ids";

// ---------------------------------------------------------------------------
// Snapshot ingestion (called after each Apify scrape)
// ---------------------------------------------------------------------------

export async function takeSnapshots(profileId: string, accountId: string) {
  const posts = await db
    .select({
      id: engagementPosts.id,
      likesCount: engagementPosts.likesCount,
      commentsCount: engagementPosts.commentsCount,
    })
    .from(engagementPosts)
    .where(eq(engagementPosts.profileId, profileId));

  if (posts.length === 0) return 0;

  const values = posts.map((p) => ({
    id: createObjectId("snap"),
    postId: p.id,
    profileId,
    accountId,
    likesCount: p.likesCount,
    commentsCount: p.commentsCount,
    repostsCount: 0, // Apify doesn't give per-post reposts reliably
  }));

  await db.insert(postSnapshots).values(values);
  return values.length;
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
  deltaLikes: number;
  deltaComments: number;
  deltaTotal: number;
  hasDelta: boolean;
}

export async function getPostDeltas(profileId: string): Promise<PostDelta[]> {
  const posts = await db
    .select()
    .from(engagementPosts)
    .where(eq(engagementPosts.profileId, profileId))
    .orderBy(desc(engagementPosts.likesCount));

  const results: PostDelta[] = [];

  for (const post of posts) {
    const snapshots = await db
      .select({
        likesCount: postSnapshots.likesCount,
        commentsCount: postSnapshots.commentsCount,
        capturedAt: postSnapshots.capturedAt,
      })
      .from(postSnapshots)
      .where(eq(postSnapshots.postId, post.id))
      .orderBy(desc(postSnapshots.capturedAt))
      .limit(2);

    let deltaLikes = 0;
    let deltaComments = 0;
    let hasDelta = false;

    if (snapshots.length >= 2) {
      const [curr, prev] = snapshots;
      deltaLikes = curr.likesCount - prev.likesCount;
      deltaComments = curr.commentsCount - prev.commentsCount;
      hasDelta = true;
    }

    results.push({
      postId: post.id,
      content: post.content,
      postUrl: post.postUrl,
      postedAt: post.postedAt,
      currentLikes: post.likesCount,
      currentComments: post.commentsCount,
      deltaLikes,
      deltaComments,
      deltaTotal: deltaLikes + deltaComments,
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
  totalEngagement: number;
  deltaLikes: number;
  deltaComments: number;
  deltaTotal: number;
  postsWithGrowth: number;
  snapshotCount: number;
  hasComparison: boolean;
}

export async function getProfileGrowth(profileId: string, accountId: string): Promise<ProfileGrowth> {
  const [profile] = await db
    .select()
    .from(engagementProfiles)
    .where(eq(engagementProfiles.id, profileId));

  const posts = await db
    .select()
    .from(engagementPosts)
    .where(eq(engagementPosts.profileId, profileId));

  const totalLikes = posts.reduce((s, p) => s + p.likesCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentsCount, 0);

  const deltas = await getPostDeltas(profileId);
  const deltaLikes = deltas.reduce((s, d) => s + d.deltaLikes, 0);
  const deltaComments = deltas.reduce((s, d) => s + d.deltaComments, 0);
  const postsWithGrowth = deltas.filter((d) => d.hasDelta && d.deltaTotal > 0).length;

  // Count distinct scrape sessions (snapshots for first post)
  let snapshotCount = 0;
  if (posts.length > 0) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(postSnapshots)
      .where(eq(postSnapshots.postId, posts[0].id));
    snapshotCount = countResult?.count ?? 0;
  }

  return {
    profileId,
    displayName: profile?.displayName ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    totalPosts: posts.length,
    totalLikes,
    totalComments,
    totalEngagement: totalLikes + totalComments,
    deltaLikes,
    deltaComments,
    deltaTotal: deltaLikes + deltaComments,
    postsWithGrowth,
    snapshotCount,
    hasComparison: snapshotCount >= 2,
  };
}

export async function getAccountGrowth(accountId: string): Promise<{
  profiles: ProfileGrowth[];
  totals: {
    totalPosts: number;
    totalEngagement: number;
    deltaTotal: number;
    hasComparison: boolean;
  };
}> {
  const profiles = await db
    .select()
    .from(engagementProfiles)
    .where(eq(engagementProfiles.accountId, accountId));

  const growths: ProfileGrowth[] = [];
  for (const p of profiles) {
    growths.push(await getProfileGrowth(p.id, accountId));
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
