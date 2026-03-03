CREATE TABLE "account_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"assignee_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "mrr" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_actions" ADD CONSTRAINT "account_actions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_actions" ADD CONSTRAINT "account_actions_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;