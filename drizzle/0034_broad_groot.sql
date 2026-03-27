CREATE TABLE "twitter_post_engagements" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"author_handle" text,
	"author_twitter_url" text,
	"author_bio" text,
	"author_company" text,
	"author_profile_image" text,
	"engagement_type" text NOT NULL,
	"engaged_at" timestamp,
	"scrape_window" text,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tpe_post_author_type_unique" UNIQUE("post_id","author_twitter_url","engagement_type")
);
--> statement-breakpoint
CREATE TABLE "twitter_post_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"tweet_id" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"author_handle" text,
	"author_bio" text,
	"author_twitter_url" text,
	"reply_text" text DEFAULT '' NOT NULL,
	"reply_url" text,
	"replied_at" timestamp,
	"parent_reply_id" text,
	"is_reply" boolean DEFAULT false NOT NULL,
	"replied_to_by_owner" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_post_replies_post_id_tweet_id_unique" UNIQUE("post_id","tweet_id")
);
--> statement-breakpoint
CREATE TABLE "twitter_post_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"retweets_count" integer DEFAULT 0 NOT NULL,
	"quotes_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"bookmarks_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twitter_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"external_tweet_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tweet_url" text DEFAULT '' NOT NULL,
	"tweet_type" text DEFAULT 'tweet' NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"retweets_count" integer DEFAULT 0 NOT NULL,
	"quotes_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"bookmarks_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"posted_at" timestamp,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"engagement_status" text,
	"slack_message_ts" text,
	"agent_comment" text,
	"engaged_at" timestamp,
	"early_engagers_scraped_at" timestamp,
	"late_engagers_scraped_at" timestamp,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_posts_profile_id_external_tweet_id_unique" UNIQUE("profile_id","external_tweet_id")
);
--> statement-breakpoint
CREATE TABLE "twitter_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"twitter_url" text NOT NULL,
	"twitter_handle" text,
	"display_name" text DEFAULT '' NOT NULL,
	"analytics_enabled" boolean DEFAULT false NOT NULL,
	"outbound_enabled" boolean DEFAULT false NOT NULL,
	"inbound_enabled" boolean DEFAULT false NOT NULL,
	"engagement_persona" text DEFAULT '' NOT NULL,
	"source_type" text,
	"contact_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_profiles_account_id_twitter_url_unique" UNIQUE("account_id","twitter_url")
);
--> statement-breakpoint
CREATE TABLE "twitter_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"posts_found" integer DEFAULT 0 NOT NULL,
	"posts_new" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"apify_run_id" text,
	"trigger_run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_account_id_linkedin_url_unique";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "linkedin_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "twitter_engagement_slack_channel" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "twitter_analytics_slack_channel" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "twitter_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "twitter_handle" text;--> statement-breakpoint
ALTER TABLE "twitter_post_engagements" ADD CONSTRAINT "twitter_post_engagements_post_id_twitter_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."twitter_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_engagements" ADD CONSTRAINT "twitter_post_engagements_profile_id_twitter_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."twitter_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_engagements" ADD CONSTRAINT "twitter_post_engagements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_replies" ADD CONSTRAINT "twitter_post_replies_post_id_twitter_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."twitter_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_replies" ADD CONSTRAINT "twitter_post_replies_profile_id_twitter_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."twitter_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_replies" ADD CONSTRAINT "twitter_post_replies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_snapshots" ADD CONSTRAINT "twitter_post_snapshots_post_id_twitter_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."twitter_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_snapshots" ADD CONSTRAINT "twitter_post_snapshots_profile_id_twitter_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."twitter_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_post_snapshots" ADD CONSTRAINT "twitter_post_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_posts" ADD CONSTRAINT "twitter_posts_profile_id_twitter_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."twitter_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_posts" ADD CONSTRAINT "twitter_posts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_profiles" ADD CONSTRAINT "twitter_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_profiles" ADD CONSTRAINT "twitter_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_sync_runs" ADD CONSTRAINT "twitter_sync_runs_profile_id_twitter_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."twitter_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_sync_runs" ADD CONSTRAINT "twitter_sync_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_account_linkedin_unique" ON "leads" USING btree ("account_id","linkedin_url") WHERE linkedin_url IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_account_twitter_unique" ON "leads" USING btree ("account_id","twitter_url") WHERE twitter_url IS NOT NULL;