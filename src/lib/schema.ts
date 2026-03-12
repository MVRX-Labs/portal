import { pgTable, text, timestamp, jsonb, boolean, unique, integer, index } from "drizzle-orm/pg-core";
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
  notes: text("notes"),
  contentVoiceGuidance: text("content_voice_guidance"),
  ownerId: text("owner_id").references(() => users.id),
  mrr: integer("mrr").notNull().default(0),
  mrrCurrency: text("mrr_currency").notNull().default("$"),
  nextMeetingAt: timestamp("next_meeting_at"),
  lastMeetingAt: timestamp("last_meeting_at"),
  autoCreated: boolean("auto_created").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  engagementSlackChannel: text("engagement_slack_channel"),
  analyticsSlackChannel: text("analytics_slack_channel"),
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
  contentVoiceGuidance: text("content_voice_guidance"),
  notes: text("notes"),
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

// --- Knowledge Hub tables ---

export const knowledgeChannels = pgTable(
  "knowledge_channels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("kchan")),
    accountId: text("account_id").references(() => accounts.id), // nullable for general/product channels
    slackChannelId: text("slack_channel_id").notNull(),
    slackChannelName: text("slack_channel_name").notNull(),
    channelType: text("channel_type").notNull().default("shared"), // 'shared' | 'internal' (legacy, use channelCategory)
    channelCategory: text("channel_category").notNull().default("client_shared"), // 'client_shared' | 'client_internal' | 'general' | 'product' | 'ops'
    workspaceId: text("workspace_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueChannel: unique().on(table.slackChannelId),
  })
);

export const knowledgeSyncState = pgTable(
  "knowledge_sync_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("ksync")),
    channelId: text("channel_id")
      .notNull()
      .references(() => knowledgeChannels.id),
    lastMessageTs: text("last_message_ts"), // Slack timestamp of last synced message
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    messagesIngested: integer("messages_ingested").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueChannelSync: unique().on(table.channelId),
  })
);

export const knowledgeEvents = pgTable(
  "knowledge_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("kevt")),
    accountId: text("account_id").references(() => accounts.id), // nullable for general/product channels
    channelId: text("channel_id")
      .notNull()
      .references(() => knowledgeChannels.id),
    source: text("source").notNull().default("slack"), // 'slack' | 'granola' | 'drive' | 'crm'
    sourceRef: text("source_ref").notNull(), // Slack ts, drive doc id, etc.
    threadRef: text("thread_ref"), // Parent message ts (for thread replies)
    authorSlackId: text("author_slack_id"),
    authorName: text("author_name"),
    authorSide: text("author_side"), // 'mvrx' | 'client'
    visibility: text("visibility").notNull().default("shared"), // 'shared' | 'internal'
    contentType: text("content_type").notNull().default("text"), // media type
    rawContent: text("raw_content").notNull(),
    mediaUrl: text("media_url"),
    resolvedContent: text("resolved_content"), // Transcription, fetched doc text, etc.
    links: jsonb("links").$type<string[]>().default([]),
    driveLinks: jsonb("drive_links").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    messageAt: timestamp("message_at").notNull(), // When the original message was sent
    processedAt: timestamp("processed_at"), // When normalisation ran on this event
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueSourceRef: unique().on(table.channelId, table.sourceRef),
    accountMessageAtIdx: index("knowledge_events_account_message_at_idx").on(table.accountId, table.messageAt),
    channelCreatedAtIdx: index("knowledge_events_channel_created_at_idx").on(table.channelId, table.createdAt),
  })
);

export const knowledgeUnits = pgTable(
  "knowledge_units",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("kunit")),
    accountId: text("account_id").references(() => accounts.id), // nullable for internal/product units
    channelId: text("channel_id").references(() => knowledgeChannels.id),
    unitType: text("unit_type").notNull(), // KnowledgeUnitType
    content: text("content").notNull(),
    author: text("author"), // who said/created the thing
    assignee: text("assignee"), // who needs to act on it
    assigneeContactId: text("assignee_contact_id").references(() => contacts.id),
    requestedBy: text("requested_by"), // who asked for it
    requestedByUserId: text("requested_by_user_id").references(() => users.id),
    status: text("status").notNull().default("open"), // 'open' | 'done' | 'superseded'
    dueDate: timestamp("due_date"),
    visibility: text("visibility").notNull().default("shared"),
    confidence: integer("confidence").notNull().default(80), // 0-100
    sourceEventIds: jsonb("source_event_ids").$type<string[]>().notNull().default([]),
    supersededBy: text("superseded_by"), // ID of newer unit that replaces this one
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    extractedAt: timestamp("extracted_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    accountUnitTypeIdx: index("knowledge_units_account_unit_type_idx").on(table.accountId, table.unitType),
  })
);

export const knowledgeState = pgTable(
  "knowledge_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createObjectId("kstate")),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    stateType: text("state_type").notNull(), // 'brief' | 'open_items' | 'activity_log'
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueAccountState: unique().on(table.accountId, table.stateType),
  })
);

export const knowledgeDigestMessages = pgTable(
  "knowledge_digest_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `kdig_${crypto.randomUUID().replace(/-/g, "")}`),
    unitId: text("unit_id")
      .notNull()
      .references(() => knowledgeUnits.id),
    recipientSlackId: text("recipient_slack_id").notNull(),
    channelId: text("channel_id").notNull(), // Slack DM channel ID
    threadTs: text("thread_ts").notNull(), // parent message ts
    messageTs: text("message_ts").notNull(), // this item's message ts
    // Fix 8: markedDone should never be NULL — enforce NOT NULL
    markedDone: boolean("marked_done").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Fix 5: Prevent duplicate digest entries per recipient per unit
    uniqueUnitRecipient: unique().on(table.unitId, table.recipientSlackId),
    // Fix 5: Fast webhook lookups by channel + message timestamp
    channelMessageTsIdx: index("knowledge_digest_messages_channel_message_ts_idx").on(
      table.channelId,
      table.messageTs,
    ),
  }),
);

// --- Secrets tables ---

export const secretTypes = pgTable("secret_types", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("sectype")),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const secrets = pgTable("secrets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("secret")),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  contactId: text("contact_id").references(() => contacts.id),
  typeId: text("type_id")
    .notNull()
    .references(() => secretTypes.id),
  name: text("name").notNull(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
