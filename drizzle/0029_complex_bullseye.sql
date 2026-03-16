CREATE TABLE "icp_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"target_titles" jsonb DEFAULT '[]'::jsonb,
	"target_industries" jsonb DEFAULT '[]'::jsonb,
	"target_company_sizes" jsonb DEFAULT '[]'::jsonb,
	"target_signals" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tier" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "conversion_pct" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
ALTER TABLE "icp_definitions" ADD CONSTRAINT "icp_definitions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;