CREATE TABLE "calendar_event_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"account_id" text NOT NULL,
	"match_confidence" text DEFAULT 'high' NOT NULL,
	"matched_via" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_accounts_event_id_account_id_unique" UNIQUE("event_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_event_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"attendee_email" text NOT NULL,
	"match_confidence" text DEFAULT 'high' NOT NULL,
	"matched_via" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_contacts_event_id_contact_id_unique" UNIQUE("event_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"google_event_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"summary" text,
	"description" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"location" text,
	"organizer_email" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_event_id" text,
	"html_link" text,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_calendar_id_google_event_id_unique" UNIQUE("calendar_id","google_event_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"sync_token" text,
	"last_synced_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_sync_state_user_id_calendar_id_unique" UNIQUE("user_id","calendar_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "next_meeting_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_meeting_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "next_meeting_at" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_meeting_at" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_event_accounts" ADD CONSTRAINT "calendar_event_accounts_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_accounts" ADD CONSTRAINT "calendar_event_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_contacts" ADD CONSTRAINT "calendar_event_contacts_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_contacts" ADD CONSTRAINT "calendar_event_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync_state" ADD CONSTRAINT "calendar_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;