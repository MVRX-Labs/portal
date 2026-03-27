CREATE TABLE "twitter_alpha_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"icp_definition_id" text NOT NULL,
	"account_id" text NOT NULL,
	"sages" jsonb DEFAULT '[]'::jsonb,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"daily_entries" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twitter_alpha_feeds_icp_definition_id_unique" UNIQUE("icp_definition_id")
);
--> statement-breakpoint
ALTER TABLE "twitter_alpha_feeds" ADD CONSTRAINT "twitter_alpha_feeds_icp_definition_id_icp_definitions_id_fk" FOREIGN KEY ("icp_definition_id") REFERENCES "public"."icp_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitter_alpha_feeds" ADD CONSTRAINT "twitter_alpha_feeds_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;