-- Rename summary -> notes on accounts
ALTER TABLE "accounts" RENAME COLUMN "summary" TO "notes";

-- Add notes to contacts
ALTER TABLE "contacts" ADD COLUMN "notes" text;

-- Secret types table
CREATE TABLE "secret_types" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Secrets table
CREATE TABLE "secrets" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL REFERENCES "accounts"("id"),
  "contact_id" text REFERENCES "contacts"("id"),
  "type_id" text NOT NULL REFERENCES "secret_types"("id"),
  "name" text NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
