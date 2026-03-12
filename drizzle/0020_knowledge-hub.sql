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
ALTER TABLE "knowledge_digest_messages" ADD CONSTRAINT "knowledge_digest_messages_unit_id_knowledge_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."knowledge_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_digest_messages_channel_message_ts_idx" ON "knowledge_digest_messages" USING btree ("channel_id","message_ts");
