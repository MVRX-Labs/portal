CREATE TABLE "engagement_jobs" (
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
CREATE TABLE "engagement_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"apify_post_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"post_url" text DEFAULT '' NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"posted_at" timestamp,
	"engagement_status" text DEFAULT 'pending' NOT NULL,
	"slack_message_ts" text,
	"agent_comment" text,
	"engaged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_posts_profile_id_apify_post_id_unique" UNIQUE("profile_id","apify_post_id")
);
--> statement-breakpoint
CREATE TABLE "engagement_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"linkedin_url" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"engagement_persona" text DEFAULT '' NOT NULL,
	"last_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_profiles_account_id_linkedin_url_unique" UNIQUE("account_id","linkedin_url")
);
--> statement-breakpoint
CREATE TABLE "engagement_raw_results" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"apify_item_id" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_raw_results_profile_id_apify_item_id_unique" UNIQUE("profile_id","apify_item_id")
);
--> statement-breakpoint
ALTER TABLE "engagement_jobs" ADD CONSTRAINT "engagement_jobs_profile_id_engagement_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."engagement_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_jobs" ADD CONSTRAINT "engagement_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_posts" ADD CONSTRAINT "engagement_posts_profile_id_engagement_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."engagement_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_profiles" ADD CONSTRAINT "engagement_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_raw_results" ADD CONSTRAINT "engagement_raw_results_job_id_engagement_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."engagement_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_raw_results" ADD CONSTRAINT "engagement_raw_results_profile_id_engagement_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."engagement_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "engagement_client_id";