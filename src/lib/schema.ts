import { pgTable, text, timestamp, jsonb, boolean, unique, integer } from "drizzle-orm/pg-core";
import { createObjectId } from "./ids";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("user")),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  slackUserId: text("slack_user_id"),
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
  emailDomain: text("email_domain"),
  linkedinUrl: text("linkedin_url"),
  engagementScrapeEnabled: boolean("engagement_scrape_enabled").notNull().default(false),
  googleDriveFolderId: text("google_drive_folder_id"),
  summary: text("summary"),
  ownerId: text("owner_id").references(() => users.id),
  mrr: integer("mrr").notNull().default(0),
  mrrCurrency: text("mrr_currency").notNull().default("$"),
  nextMeetingAt: timestamp("next_meeting_at"),
  lastMeetingAt: timestamp("last_meeting_at"),
  autoCreated: boolean("auto_created").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  engagementSlackChannel: text("engagement_slack_channel"),
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
  })
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
  })
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
  })
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
  })
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
  })
);

// --- Engagement bot tables ---

export const engagementProfiles = pgTable(
  "engagement_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("engprof")),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    linkedinUrl: text("linkedin_url").notNull(),
    displayName: text("display_name").notNull().default(""),
    engagementPersona: text("engagement_persona").notNull().default(""),
    lastScrapedAt: timestamp("last_scraped_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueAccountUrl: unique().on(table.accountId, table.linkedinUrl),
  })
);

export const engagementPosts = pgTable(
  "engagement_posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("engpost")),
    profileId: text("profile_id")
      .notNull()
      .references(() => engagementProfiles.id),
    apifyPostId: text("apify_post_id").notNull(),
    content: text("content").notNull().default(""),
    postUrl: text("post_url").notNull().default(""),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    postedAt: timestamp("posted_at"),
    engagementStatus: text("engagement_status").notNull().default("pending"),
    slackMessageTs: text("slack_message_ts"),
    agentComment: text("agent_comment"),
    engagedAt: timestamp("engaged_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueProfilePost: unique().on(table.profileId, table.apifyPostId),
  })
);

export const engagementJobs = pgTable("engagement_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("engjob")),
  profileId: text("profile_id")
    .notNull()
    .references(() => engagementProfiles.id),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  status: text("status").notNull().default("queued"),
  postsFound: integer("posts_found").notNull().default(0),
  postsNew: integer("posts_new").notNull().default(0),
  errorMessage: text("error_message"),
  apifyRunId: text("apify_run_id"),
  triggerRunId: text("trigger_run_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// --- Post analytics (tracking OUR CLIENTS' LinkedIn profiles) ---
// Separate from engagement_profiles which track external people to engage WITH

export const managedProfiles = pgTable(
  "managed_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("mprof")),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    linkedinUrl: text("linkedin_url").notNull(),
    displayName: text("display_name").notNull().default(""),
    linkedinSlug: text("linkedin_slug"),
    active: boolean("active").notNull().default(true),
    lastScrapedAt: timestamp("last_scraped_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueAccountUrl: unique().on(table.accountId, table.linkedinUrl),
  })
);

export const managedPosts = pgTable(
  "managed_posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("mpost")),
    profileId: text("profile_id")
      .notNull()
      .references(() => managedProfiles.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    apifyPostId: text("apify_post_id").notNull(),
    content: text("content").notNull().default(""),
    postUrl: text("post_url").notNull().default(""),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    repostsCount: integer("reposts_count").notNull().default(0),
    postedAt: timestamp("posted_at"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueProfilePost: unique().on(table.profileId, table.apifyPostId),
  })
);

export const managedPostSnapshots = pgTable("managed_post_snapshots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("msnap")),
  postId: text("post_id")
    .notNull()
    .references(() => managedPosts.id),
  profileId: text("profile_id")
    .notNull()
    .references(() => managedProfiles.id),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  repostsCount: integer("reposts_count").notNull().default(0),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export const analyticsReports = pgTable(
  "analytics_reports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("arpt")),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    profileId: text("profile_id").references(() => managedProfiles.id),
    reportType: text("report_type").notNull().default("weekly"),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    reportData: jsonb("report_data").notNull().default({}),
    pdfUrl: text("pdf_url"),
    slackTs: text("slack_ts"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueReport: unique().on(table.accountId, table.profileId, table.reportType, table.periodStart),
  })
);

export const engagementRawResults = pgTable(
  "engagement_raw_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("engraw")),
    jobId: text("job_id")
      .notNull()
      .references(() => engagementJobs.id),
    profileId: text("profile_id")
      .notNull()
      .references(() => engagementProfiles.id),
    apifyItemId: text("apify_item_id").notNull(),
    rawData: jsonb("raw_data").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueProfileItem: unique().on(table.profileId, table.apifyItemId),
  })
);
