CREATE TABLE IF NOT EXISTS "knowledge_digest_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"recipient_slack_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_ts" text NOT NULL,
	"message_ts" text NOT NULL,
	"marked_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_digest_messages_unit_id_recipient_slack_id_unique" UNIQUE("unit_id","recipient_slack_id")
);
--> statement-breakpoint
CREATE TABLE "secret_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "secret_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text,
	"type_id" text NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "content_voice_guidance" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "content_voice_guidance" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "knowledge_digest_messages" ADD CONSTRAINT "knowledge_digest_messages_unit_id_knowledge_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."knowledge_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_type_id_secret_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."secret_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_digest_messages_channel_message_ts_idx" ON "knowledge_digest_messages" USING btree ("channel_id","message_ts");--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "summary";