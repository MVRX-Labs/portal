CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text,
	"linkedin_url" text NOT NULL,
	"linkedin_slug" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"headline" text,
	"company" text,
	"profile_image_url" text,
	"engagement_types" jsonb DEFAULT '[]'::jsonb,
	"engagement_posts" jsonb DEFAULT '[]'::jsonb,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leads_account_id_linkedin_url_unique" UNIQUE("account_id","linkedin_url")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "engagement_scrape_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "engagement_scrape_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD COLUMN "trigger_run_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;