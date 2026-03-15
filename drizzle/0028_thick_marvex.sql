CREATE TABLE "apify_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"cache_key_human" text NOT NULL,
	"actor_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "apify_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE INDEX "apify_cache_expires_idx" ON "apify_cache" USING btree ("expires_at");