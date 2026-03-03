import { pgTable, text, timestamp, jsonb, boolean, unique, integer } from "drizzle-orm/pg-core";
import { createObjectId } from "./ids";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("user")),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("acct")),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  industry: text("industry"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  engagementScrapeEnabled: boolean("engagement_scrape_enabled").notNull().default(false),
  googleDriveFolderId: text("google_drive_folder_id"),
  summary: text("summary"),
  ownerId: text("owner_id").references(() => users.id),
  mrr: integer("mrr").notNull().default(0),
  nextMeetingAt: timestamp("next_meeting_at"),
  lastMeetingAt: timestamp("last_meeting_at"),
  autoCreated: boolean("auto_created").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("contact")),
  name: text("name").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  accountEmail: text("account_email"),
  personalEmail: text("personal_email"),
  linkedinUrl: text("linkedin_url"),
  engagementScrapeEnabled: boolean("engagement_scrape_enabled").notNull().default(false),
  nextMeetingAt: timestamp("next_meeting_at"),
  lastMeetingAt: timestamp("last_meeting_at"),
  autoCreated: boolean("auto_created").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leads = pgTable(
  "leads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("lead")),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    contactId: text("contact_id").references(() => contacts.id),
    linkedinUrl: text("linkedin_url").notNull(),
    linkedinUrnUrl: text("linkedin_urn_url"),
    linkedinSlug: text("linkedin_slug"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    headline: text("headline"),
    company: text("company"),
    profileImageUrl: text("profile_image_url"),
    engagementTypes: jsonb("engagement_types").$type<string[]>().default([]),
    engagementPosts: jsonb("engagement_posts").$type<string[]>().default([]),
    // Based on the post date, not the scrape date. Represents the earliest/latest
    // post where this person was seen engaging.
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueAccountLead: unique().on(table.accountId, table.linkedinUrl),
  }),
);

export const toolRuns = pgTable("tool_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("run")),
  tool: text("tool").notNull(),
  status: text("status").notNull(),
  inputs: jsonb("inputs").notNull(),
  output: text("output"),
  outputUrl: text("output_url"),
  error: text("error"),
  triggerRunId: text("trigger_run_id"),
  userId: text("user_id").references(() => users.id),
  accountId: text("account_id").references(() => accounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accountActions = pgTable("account_actions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("action")),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date"),
  assigneeId: text("assignee_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Calendar sync tables ---

export const calendarSyncState = pgTable(
  "calendar_sync_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("calsync")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    calendarId: text("calendar_id").notNull(),
    syncToken: text("sync_token"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserCalendar: unique().on(table.userId, table.calendarId),
  }),
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("calevent")),
    googleEventId: text("google_event_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    summary: text("summary"),
    description: text("description"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    location: text("location"),
    organizerEmail: text("organizer_email"),
    status: text("status").notNull().default("confirmed"),
    attendees: jsonb("attendees")
      .$type<
        Array<{
          email: string;
          displayName?: string;
          responseStatus?: string;
          self?: boolean;
          organizer?: boolean;
        }>
      >()
      .notNull()
      .default([]),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurringEventId: text("recurring_event_id"),
    htmlLink: text("html_link"),
    notifiedAt: timestamp("notified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueCalendarEvent: unique().on(table.calendarId, table.googleEventId),
  }),
);

export const calendarEventAccounts = pgTable(
  "calendar_event_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("calevtacct")),
    eventId: text("event_id")
      .notNull()
      .references(() => calendarEvents.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    matchConfidence: text("match_confidence").notNull().default("high"),
    matchedVia: text("matched_via"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueEventAccount: unique().on(table.eventId, table.accountId),
  }),
);

export const calendarEventContacts = pgTable(
  "calendar_event_contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("calevtcont")),
    eventId: text("event_id")
      .notNull()
      .references(() => calendarEvents.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    attendeeEmail: text("attendee_email").notNull(),
    matchConfidence: text("match_confidence").notNull().default("high"),
    matchedVia: text("matched_via"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueEventContact: unique().on(table.eventId, table.contactId),
  }),
);
