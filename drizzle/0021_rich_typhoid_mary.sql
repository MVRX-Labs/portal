CREATE TABLE "linkedin_post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"apify_comment_id" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"author_linkedin_url" text,
	"author_headline" text,
	"comment_text" text DEFAULT '' NOT NULL,
	"commented_at" timestamp,
	"parent_comment_id" text,
	"is_reply" boolean DEFAULT false NOT NULL,
	"replied_to_by_owner" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_post_comments_post_id_apify_comment_id_unique" UNIQUE("post_id","apify_comment_id")
);
--> statement-breakpoint
CREATE TABLE "linkedin_post_engagements" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"author_linkedin_url" text,
	"author_linkedin_slug" text,
	"author_headline" text,
	"author_company" text,
	"author_profile_image" text,
	"engagement_type" text NOT NULL,
	"engaged_at" timestamp,
	"scrape_window" text,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lpe_post_author_type_unique" UNIQUE("post_id","author_linkedin_url","engagement_type")
);
--> statement-breakpoint
CREATE TABLE "linkedin_post_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"reposts_count" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"account_id" text NOT NULL,
	"apify_post_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"post_url" text DEFAULT '' NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"reposts_count" integer DEFAULT 0 NOT NULL,
	"posted_at" timestamp,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"engagement_status" text,
	"slack_message_ts" text,
	"agent_comment" text,
	"engaged_at" timestamp,
	"early_engagers_scraped_at" timestamp,
	"late_engagers_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_posts_profile_id_apify_post_id_unique" UNIQUE("profile_id","apify_post_id")
);
--> statement-breakpoint
CREATE TABLE "linkedin_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"linkedin_url" text NOT NULL,
	"linkedin_slug" text,
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
	CONSTRAINT "linkedin_profiles_account_id_linkedin_url_unique" UNIQUE("account_id","linkedin_url")
);
--> statement-breakpoint
CREATE TABLE "linkedin_sync_runs" (
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
ALTER TABLE "linkedin_post_comments" ADD CONSTRAINT "linkedin_post_comments_post_id_linkedin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."linkedin_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_comments" ADD CONSTRAINT "linkedin_post_comments_profile_id_linkedin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."linkedin_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_comments" ADD CONSTRAINT "linkedin_post_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_engagements" ADD CONSTRAINT "linkedin_post_engagements_post_id_linkedin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."linkedin_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_engagements" ADD CONSTRAINT "linkedin_post_engagements_profile_id_linkedin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."linkedin_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_engagements" ADD CONSTRAINT "linkedin_post_engagements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_snapshots" ADD CONSTRAINT "linkedin_post_snapshots_post_id_linkedin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."linkedin_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_snapshots" ADD CONSTRAINT "linkedin_post_snapshots_profile_id_linkedin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."linkedin_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_snapshots" ADD CONSTRAINT "linkedin_post_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_posts" ADD CONSTRAINT "linkedin_posts_profile_id_linkedin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."linkedin_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_posts" ADD CONSTRAINT "linkedin_posts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_profiles" ADD CONSTRAINT "linkedin_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_profiles" ADD CONSTRAINT "linkedin_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_sync_runs" ADD CONSTRAINT "linkedin_sync_runs_profile_id_linkedin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."linkedin_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_sync_runs" ADD CONSTRAINT "linkedin_sync_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;