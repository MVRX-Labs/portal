/**
 * Fixes the production migration journal by inserting all migration records
 * into drizzle.__drizzle_migrations. Use when prod was set up with db:push
 * and db:migrate fails with "relation already exists".
 *
 * Run: STORAGE_DATABASE_URL=$PROD_STORAGE_DATABASE_URL npx tsx scripts/fix-prod-migration-journal.ts
 */
import { config } from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

async function main() {
  const dbUrl = process.env.STORAGE_DATABASE_URL;
  if (!dbUrl) {
    throw new Error("STORAGE_DATABASE_URL is required");
  }

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8"));
  const sql = postgres(dbUrl);

  // Ensure schema and table exist
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const entries = journal.entries as Array<{ tag: string; when: number }>;
  let inserted = 0;

  for (const entry of entries) {
    const migrationPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    const query = fs.readFileSync(migrationPath, "utf-8");
    const hash = crypto.createHash("sha256").update(query).digest("hex");

    // Insert if not already present (by hash)
    const existing = await sql`
      SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
      inserted++;
      console.log(`  Inserted ${entry.tag} (hash: ${hash.slice(0, 12)}...)`);
    } else {
      console.log(`  Skipped ${entry.tag} (already present)`);
    }
  }

  await sql.end();
  console.log(`\nDone. Inserted ${inserted} migration record(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
