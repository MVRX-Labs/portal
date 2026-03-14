CREATE TABLE "lead_csvs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text,
	"profile_id" text,
	"scrape_window" text NOT NULL,
	"description" text NOT NULL,
	"filename" text NOT NULL,
	"csv_content" text NOT NULL,
	"lead_count" integer NOT NULL,
	"post_urls" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lead_csv_id" text;--> statement-breakpoint
ALTER TABLE "lead_csvs" ADD CONSTRAINT "lead_csvs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_csvs" ADD CONSTRAINT "lead_csvs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_csvs" ADD CONSTRAINT "lead_csvs_profile_id_linkedin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."linkedin_profiles"("id") ON DELETE no action ON UPDATE no action;