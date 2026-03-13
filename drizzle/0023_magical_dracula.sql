-- Rename apify_comment_id -> comment_urn (the column now stores the stable LinkedIn comment ID, not a fabricated key)
ALTER TABLE "linkedin_post_comments" RENAME COLUMN "apify_comment_id" TO "comment_urn";

-- Add comment_url column for direct links to comments
ALTER TABLE "linkedin_post_comments" ADD COLUMN "comment_url" text;

-- Recreate unique constraint with new column name
ALTER TABLE "linkedin_post_comments" DROP CONSTRAINT "linkedin_post_comments_post_id_apify_comment_id_unique";
ALTER TABLE "linkedin_post_comments" ADD CONSTRAINT "linkedin_post_comments_post_id_comment_urn_unique" UNIQUE("post_id","comment_urn");

-- Delete all old fabricated dedup keys (they all contain '_' from the authorSlug_postId format).
-- Rows on posts ≤30 days old will be re-scraped with real data on the next sync cycle.
-- Rows on older posts are lost but had empty comment_text anyway.
DELETE FROM "linkedin_post_comments" WHERE "comment_urn" LIKE '%_%';
