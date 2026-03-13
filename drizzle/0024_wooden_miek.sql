DROP TABLE "engagement_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "engagement_posts" CASCADE;--> statement-breakpoint
DROP TABLE "engagement_profiles" CASCADE;--> statement-breakpoint
DROP TABLE "engagement_raw_results" CASCADE;--> statement-breakpoint
DROP TABLE "managed_post_snapshots" CASCADE;--> statement-breakpoint
DROP TABLE "managed_posts" CASCADE;--> statement-breakpoint
DROP TABLE "managed_profiles" CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "engagement_scrape_enabled";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "engagement_scrape_enabled";