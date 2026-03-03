import { pgTable, text, timestamp, jsonb, boolean, unique } from "drizzle-orm/pg-core";
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
