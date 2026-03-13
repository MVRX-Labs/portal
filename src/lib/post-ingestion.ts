import { normalizePost } from "./engagement-bot";
import { extractLinkedinSlug } from "./linkedin-profiles";

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
    const slug = extractLinkedinSlug(candidate);
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
  options?: { expectedLinkedinSlug?: string; expectedLinkedinUrl?: string }
): ApifyPost | null {
  const expectedLinkedinSlug =
    options?.expectedLinkedinSlug?.toLowerCase() ||
    extractLinkedinSlug(options?.expectedLinkedinUrl ?? "") ||
    undefined;
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
