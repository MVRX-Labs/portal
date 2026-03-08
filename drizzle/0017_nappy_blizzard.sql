CREATE TABLE "knowledge_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"slack_channel_id" text NOT NULL,
	"slack_channel_name" text NOT NULL,
	"channel_type" text DEFAULT 'shared' NOT NULL,
	"workspace_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_channels_slack_channel_id_unique" UNIQUE("slack_channel_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"source" text DEFAULT 'slack' NOT NULL,
	"source_ref" text NOT NULL,
	"thread_ref" text,
	"author_slack_id" text,
	"author_name" text,
	"author_side" text,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"content_type" text DEFAULT 'text' NOT NULL,
	"raw_content" text NOT NULL,
	"media_url" text,
	"resolved_content" text,
	"links" jsonb DEFAULT '[]'::jsonb,
	"drive_links" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"message_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_events_channel_id_source_ref_unique" UNIQUE("channel_id","source_ref")
);
--> statement-breakpoint
CREATE TABLE "knowledge_state" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"state_type" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_state_account_id_state_type_unique" UNIQUE("account_id","state_type")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"last_message_ts" text,
	"last_synced_at" timestamp,
	"last_sync_error" text,
	"messages_ingested" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sync_state_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_units" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"unit_type" text NOT NULL,
	"content" text NOT NULL,
	"author" text,
	"assignee" text,
	"due_date" timestamp,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"superseded_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"extracted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_channels" ADD CONSTRAINT "knowledge_channels_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_channel_id_knowledge_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."knowledge_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_state" ADD CONSTRAINT "knowledge_state_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sync_state" ADD CONSTRAINT "knowledge_sync_state_channel_id_knowledge_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."knowledge_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD CONSTRAINT "knowledge_units_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;