CREATE TABLE IF NOT EXISTS "managed_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"linkedin_url" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"linkedin_slug" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "managed_profiles_account_id_linkedin_url_unique" UNIQUE("account_id","linkedin_url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "managed_posts" (
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "managed_posts_profile_id_apify_post_id_unique" UNIQUE("profile_id","apify_post_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "managed_post_snapshots" (
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
CREATE TABLE IF NOT EXISTS "analytics_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"profile_id" text,
	"report_type" text DEFAULT 'weekly' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"report_data" jsonb DEFAULT '{}' NOT NULL,
	"pdf_url" text,
	"slack_ts" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_reports_account_id_profile_id_report_type_period_start_unique" UNIQUE("account_id","profile_id","report_type","period_start")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "managed_profiles" ADD CONSTRAINT "managed_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "managed_posts" ADD CONSTRAINT "managed_posts_profile_id_managed_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."managed_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "managed_posts" ADD CONSTRAINT "managed_posts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "managed_post_snapshots" ADD CONSTRAINT "managed_post_snapshots_post_id_managed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."managed_posts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "managed_post_snapshots" ADD CONSTRAINT "managed_post_snapshots_profile_id_managed_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."managed_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "managed_post_snapshots" ADD CONSTRAINT "managed_post_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_profile_id_managed_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."managed_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
