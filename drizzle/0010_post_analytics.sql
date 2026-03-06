-- Post Analytics: tracking OUR CLIENTS' LinkedIn profiles (managed accounts)
-- Completely separate from engagement_profiles (which track external people to engage WITH)

-- Managed LinkedIn profiles — our clients' accounts we run
CREATE TABLE IF NOT EXISTS "managed_profiles" (
    "id" text PRIMARY KEY NOT NULL,
    "account_id" text NOT NULL REFERENCES "accounts"("id"),
    "linkedin_url" text NOT NULL,
    "display_name" text NOT NULL DEFAULT '',
    "linkedin_slug" text,
    "active" boolean NOT NULL DEFAULT true,
    "last_scraped_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    UNIQUE("account_id", "linkedin_url")
);

-- Posts from managed profiles — our clients' own posts
CREATE TABLE IF NOT EXISTS "managed_posts" (
    "id" text PRIMARY KEY NOT NULL,
    "profile_id" text NOT NULL REFERENCES "managed_profiles"("id"),
    "account_id" text NOT NULL REFERENCES "accounts"("id"),
    "apify_post_id" text NOT NULL,
    "content" text NOT NULL DEFAULT '',
    "post_url" text NOT NULL DEFAULT '',
    "likes_count" integer NOT NULL DEFAULT 0,
    "comments_count" integer NOT NULL DEFAULT 0,
    "reposts_count" integer NOT NULL DEFAULT 0,
    "posted_at" timestamp,
    "discovered_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    UNIQUE("profile_id", "apify_post_id")
);

CREATE INDEX IF NOT EXISTS "idx_managed_posts_profile" ON "managed_posts"("profile_id", "posted_at");
CREATE INDEX IF NOT EXISTS "idx_managed_posts_account" ON "managed_posts"("account_id");

-- Engagement snapshots — time-series data for growth tracking
CREATE TABLE IF NOT EXISTS "managed_post_snapshots" (
    "id" text PRIMARY KEY NOT NULL,
    "post_id" text NOT NULL REFERENCES "managed_posts"("id"),
    "profile_id" text NOT NULL REFERENCES "managed_profiles"("id"),
    "account_id" text NOT NULL REFERENCES "accounts"("id"),
    "likes_count" integer NOT NULL DEFAULT 0,
    "comments_count" integer NOT NULL DEFAULT 0,
    "reposts_count" integer NOT NULL DEFAULT 0,
    "captured_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_managed_snapshots_post" ON "managed_post_snapshots"("post_id", "captured_at");
CREATE INDEX IF NOT EXISTS "idx_managed_snapshots_account" ON "managed_post_snapshots"("account_id", "captured_at");

-- Analytics reports cache
CREATE TABLE IF NOT EXISTS "analytics_reports" (
    "id" text PRIMARY KEY NOT NULL,
    "account_id" text NOT NULL REFERENCES "accounts"("id"),
    "profile_id" text REFERENCES "managed_profiles"("id"),
    "report_type" text NOT NULL DEFAULT 'weekly',
    "period_start" timestamp NOT NULL,
    "period_end" timestamp NOT NULL,
    "report_data" jsonb NOT NULL DEFAULT '{}',
    "pdf_url" text,
    "slack_ts" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    UNIQUE("account_id", "profile_id", "report_type", "period_start")
);
