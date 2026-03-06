-- Post analytics: snapshot tracking + growth reports
-- Extends the existing engagement_posts table with time-series snapshots

CREATE TABLE IF NOT EXISTS "post_snapshots" (
    "id" text PRIMARY KEY NOT NULL,
    "post_id" text NOT NULL REFERENCES "engagement_posts"("id"),
    "profile_id" text NOT NULL REFERENCES "engagement_profiles"("id"),
    "account_id" text NOT NULL REFERENCES "accounts"("id"),
    "likes_count" integer NOT NULL DEFAULT 0,
    "comments_count" integer NOT NULL DEFAULT 0,
    "reposts_count" integer NOT NULL DEFAULT 0,
    "captured_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_post_snapshots_post" ON "post_snapshots"("post_id", "captured_at");
CREATE INDEX IF NOT EXISTS "idx_post_snapshots_account" ON "post_snapshots"("account_id", "captured_at");

-- Analytics reports cache
CREATE TABLE IF NOT EXISTS "analytics_reports" (
    "id" text PRIMARY KEY NOT NULL,
    "account_id" text NOT NULL REFERENCES "accounts"("id"),
    "profile_id" text REFERENCES "engagement_profiles"("id"),
    "report_type" text NOT NULL DEFAULT 'weekly',
    "period_start" timestamp NOT NULL,
    "period_end" timestamp NOT NULL,
    "report_data" jsonb NOT NULL DEFAULT '{}',
    "pdf_url" text,
    "slack_ts" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    UNIQUE("account_id", "profile_id", "report_type", "period_start")
);
