/**
 * One-time backfill: copy existing posts from managed_posts → linkedin_posts
 * and managed_post_snapshots → linkedin_post_snapshots.
 *
 * Requires linkedin_profiles to already be populated (run migrate-linkedin-profiles.ts first).
 *
 * Run with: npx tsx scripts/backfill-linkedin-posts.ts [--dry-run]
 */
import "dotenv/config";

import { db } from "../src/lib/db";
import {
  managedProfiles,
  managedPosts,
  managedPostSnapshots,
  linkedinProfiles,
  linkedinPosts,
  linkedinPostSnapshots,
} from "../src/lib/schema";
import { eq, and } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase()
    .replace(/^https?:\/\/www\./, "https://");
}

async function main() {
  if (DRY_RUN) console.log("=== DRY RUN — no writes will be performed ===\n");
  console.log("Backfilling linkedin_posts from managed_posts...\n");

  // Build mapping: managed profile → linkedin profile (by accountId + linkedinUrl)
  const oldProfiles = await db.select().from(managedProfiles);
  const newProfiles = await db.select().from(linkedinProfiles);

  const newProfileByKey = new Map(newProfiles.map((p) => [`${p.accountId}|${normalizeUrl(p.linkedinUrl)}`, p]));

  const profileMap = new Map<string, string>(); // old profileId → new profileId
  let unmapped = 0;

  for (const old of oldProfiles) {
    const key = `${old.accountId}|${normalizeUrl(old.linkedinUrl)}`;
    const newProfile = newProfileByKey.get(key);
    if (newProfile) {
      profileMap.set(old.id, newProfile.id);
    } else {
      console.warn(`  WARNING: No linkedin_profiles match for managed profile ${old.id} (${old.linkedinUrl})`);
      unmapped++;
    }
  }

  console.log(`Profile mapping: ${profileMap.size} mapped, ${unmapped} unmapped\n`);

  // Backfill posts
  const allOldPosts = await db.select().from(managedPosts);
  let postsInserted = 0;
  let postsSkipped = 0;

  for (const oldPost of allOldPosts) {
    const newProfileId = profileMap.get(oldPost.profileId);
    if (!newProfileId) {
      postsSkipped++;
      continue;
    }

    // Check if already exists (by profileId + apifyPostId)
    const [existing] = await db
      .select({ id: linkedinPosts.id })
      .from(linkedinPosts)
      .where(and(eq(linkedinPosts.profileId, newProfileId), eq(linkedinPosts.apifyPostId, oldPost.apifyPostId)))
      .limit(1);

    if (existing) {
      postsSkipped++;
      continue;
    }

    if (!DRY_RUN) {
      await db.insert(linkedinPosts).values({
        profileId: newProfileId,
        accountId: oldPost.accountId,
        apifyPostId: oldPost.apifyPostId,
        content: oldPost.content,
        postUrl: oldPost.postUrl,
        likesCount: oldPost.likesCount,
        commentsCount: oldPost.commentsCount,
        repostsCount: oldPost.repostsCount,
        postedAt: oldPost.postedAt,
        discoveredAt: oldPost.discoveredAt,
      });
    }
    postsInserted++;
  }

  const verb = DRY_RUN ? "would insert" : "inserted";
  console.log(`Posts: ${postsInserted} ${verb}, ${postsSkipped} skipped (already exist or unmapped)`);

  // Build post ID mapping for snapshots (old post ID → new post ID, by profileId + apifyPostId)
  const newPosts = await db.select().from(linkedinPosts);
  const newPostByKey = new Map(newPosts.map((p) => [`${p.profileId}|${p.apifyPostId}`, p.id]));

  // In dry-run mode, posts weren't inserted so add synthetic entries for the mapping
  if (DRY_RUN) {
    for (const oldPost of allOldPosts) {
      const newProfileId = profileMap.get(oldPost.profileId);
      if (!newProfileId) continue;
      const key = `${newProfileId}|${oldPost.apifyPostId}`;
      if (!newPostByKey.has(key)) {
        newPostByKey.set(key, `dry-run-${oldPost.id}`);
      }
    }
  }

  // Backfill snapshots
  const allOldSnapshots = await db.select().from(managedPostSnapshots);
  let snapshotsInserted = 0;
  let snapshotsSkipped = 0;

  // We need old post details to build the key
  const oldPostMap = new Map(allOldPosts.map((p) => [p.id, p]));

  for (const oldSnap of allOldSnapshots) {
    const oldPost = oldPostMap.get(oldSnap.postId);
    if (!oldPost) {
      snapshotsSkipped++;
      continue;
    }

    const newProfileId = profileMap.get(oldPost.profileId);
    if (!newProfileId) {
      snapshotsSkipped++;
      continue;
    }

    const newPostId = newPostByKey.get(`${newProfileId}|${oldPost.apifyPostId}`);
    if (!newPostId) {
      snapshotsSkipped++;
      continue;
    }

    if (!DRY_RUN) {
      await db.insert(linkedinPostSnapshots).values({
        postId: newPostId,
        profileId: newProfileId,
        accountId: oldSnap.accountId,
        likesCount: oldSnap.likesCount,
        commentsCount: oldSnap.commentsCount,
        repostsCount: oldSnap.repostsCount,
        capturedAt: oldSnap.capturedAt,
      });
    }
    snapshotsInserted++;
  }

  console.log(`Snapshots: ${snapshotsInserted} ${verb}, ${snapshotsSkipped} skipped`);
  console.log(`\nBackfill ${DRY_RUN ? "dry run" : ""} complete.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
