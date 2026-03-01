import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createObjectId } from "./ids";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createObjectId("user")),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  accountId: text("account_id").references(() => accounts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
