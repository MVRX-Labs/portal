ALTER TABLE "accounts" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "accounts" SET "slug" = lower(regexp_replace(regexp_replace(trim("name"), '[^\w\s-]', '', 'g'), '[\s_]+', '-', 'g')) WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_slug_unique" UNIQUE("slug");