import { db } from "@/lib/db";
import { managedPosts, managedPostSnapshots, managedProfiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { normalizePost } from "./engagement-bot";
import { extractManagedLinkedinSlug } from "./managed-profiles";

interface ApifyPost {
  apifyPostId: string;
  content: string;
  postUrl: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  postedAt: Date | null;
}

function parseCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function extractAuthorSlug(raw: Record<string, unknown>): string | null {
  const candidates: unknown[] = [raw.authorProfileUrl, raw.authorLinkedinUrl, raw.authorUrl];

  const author = raw.author;
  if (typeof author === "object" && author !== null) {
    const authorObj = author as Record<string, unknown>;
    candidates.push(authorObj.profileUrl, authorObj.linkedinUrl, authorObj.url);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const slug = extractManagedLinkedinSlug(candidate);
    if (slug) return slug;
  }
  return null;
}

function isManagedProfileOriginalPost(raw: Record<string, unknown>, expectedLinkedinSlug?: string): boolean {
  const activityType = String(raw.activityType || "").toLowerCase();
  if (raw.isActivity === true || raw.isRepost === true) return false;
  if (activityType === "repost" || activityType === "reshare") return false;
  if (raw.resharedPost != null || raw.reshareOf != null || raw.repostedPost != null) return false;

  if (!expectedLinkedinSlug) return true;
  const authorSlug = extractAuthorSlug(raw);
  if (!authorSlug) return true;
  return authorSlug === expectedLinkedinSlug.toLowerCase();
}

export function normalizeApifyPost(
  raw: Record<string, unknown>,
  options?: { expectedLinkedinSlug?: string; expectedLinkedinUrl?: string },
): ApifyPost | null {
  const expectedLinkedinSlug =
    options?.expectedLinkedinSlug?.toLowerCase() || extractManagedLinkedinSlug(options?.expectedLinkedinUrl ?? "") || undefined;
  if (!isManagedProfileOriginalPost(raw, expectedLinkedinSlug)) return null;

  const normalized = normalizePost(raw);
  if (!normalized.apifyPostId) return null;

  return {
    apifyPostId: normalized.apifyPostId,
    content: normalized.content.slice(0, 500),
    postUrl: normalized.postUrl,
    likesCount: normalized.likesCount,
    commentsCount: normalized.commentsCount,
    repostsCount: parseCount(raw.numShares ?? raw.repostsCount ?? raw.reshareCount),
    postedAt: normalized.postedAt,
  };
}

export async function ingestPosts(
  profileId: string,
  accountId: string,
  rawPosts: Record<string, unknown>[],
  options?: { expectedLinkedinSlug?: string; expectedLinkedinUrl?: string },
): Promise<{ total: number; newCount: number }> {
  const normalizedPosts = rawPosts
    .map((raw) => normalizeApifyPost(raw, options))
    .filter((p): p is ApifyPost => p !== null);
  const posts = Array.from(new Map(normalizedPosts.map((post) => [post.apifyPostId, post])).values());

  const existingPosts = await db
    .select({
      id: managedPosts.id,
      apifyPostId: managedPosts.apifyPostId,
      content: managedPosts.content,
      postUrl: managedPosts.postUrl,
      postedAt: managedPosts.postedAt,
    })
    .from(managedPosts)
    .where(eq(managedPosts.profileId, profileId));

  const existingByApifyPostId = new Map(existingPosts.map((post) => [post.apifyPostId, post]));

  return db.transaction(async (tx) => {
    let newCount = 0;

    for (const p of posts) {
      const existing = existingByApifyPostId.get(p.apifyPostId);

      let postId: string;

      if (existing) {
        await tx
          .update(managedPosts)
          .set({
            likesCount: p.likesCount,
            commentsCount: p.commentsCount,
            repostsCount: p.repostsCount,
            content: p.content || existing.content,
            postUrl: p.postUrl || existing.postUrl,
            postedAt: p.postedAt ?? existing.postedAt,
          })
          .where(eq(managedPosts.id, existing.id));
        postId = existing.id;
      } else {
        const [inserted] = await tx
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
          .returning({ id: managedPosts.id });
        postId = inserted.id;
        newCount++;
      }

      await tx.insert(managedPostSnapshots).values({
        postId,
        profileId,
        accountId,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        repostsCount: p.repostsCount,
      });
    }

    await tx
      .update(managedProfiles)
      .set({ lastScrapedAt: new Date(), updatedAt: new Date() })
      .where(eq(managedProfiles.id, profileId));

    return { total: posts.length, newCount };
  });
}
