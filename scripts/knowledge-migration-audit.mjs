#!/usr/bin/env node
/**
 * Knowledge Hub — DB Migration Audit
 *
 * Connects to Neon, inspects actual knowledge_* table structures,
 * compares against expected schema, and auto-applies any fixes.
 *
 * Known drift (already fixed manually — script will verify):
 *   - knowledge_events.account_id: should be nullable
 *   - knowledge_units.account_id: should be nullable
 *
 * New table to create:
 *   - knowledge_digest_messages
 */

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.STORAGE_DATABASE_URL ||
  "postgresql://neondb_owner:npg_y2JUIzRVT1Zi@ep-mute-wave-ab9agqm6-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require";

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

// ---------- Expected nullable columns ----------
// Anything not listed here that IS nullable in actual DB is fine (not checked).
// We only assert that these specific columns have the correct nullability.

const EXPECTED_NULLABLE = [
  { table: "knowledge_events", column: "account_id", nullable: true },
  { table: "knowledge_units", column: "account_id", nullable: true },
  { table: "knowledge_channels", column: "account_id", nullable: true },
  { table: "knowledge_units", column: "channel_id", nullable: true },
  { table: "knowledge_units", column: "assignee", nullable: true },
  { table: "knowledge_units", column: "assignee_contact_id", nullable: true },
  { table: "knowledge_units", column: "requested_by", nullable: true },
  { table: "knowledge_units", column: "requested_by_user_id", nullable: true },
  { table: "knowledge_units", column: "due_date", nullable: true },
  { table: "knowledge_units", column: "superseded_by", nullable: true },
  { table: "knowledge_events", column: "resolved_content", nullable: true },
  { table: "knowledge_events", column: "media_url", nullable: true },
  { table: "knowledge_events", column: "thread_ref", nullable: true },
  { table: "knowledge_events", column: "author_slack_id", nullable: true },
  { table: "knowledge_events", column: "author_name", nullable: true },
  { table: "knowledge_events", column: "author_side", nullable: true },
  { table: "knowledge_events", column: "processed_at", nullable: true },
];

// ---------- New table DDL ----------

const CREATE_DIGEST_MESSAGES = `
CREATE TABLE IF NOT EXISTS knowledge_digest_messages (
  id                  TEXT PRIMARY KEY,
  unit_id             TEXT NOT NULL REFERENCES knowledge_units(id),
  recipient_slack_id  TEXT NOT NULL,
  channel_id          TEXT NOT NULL,
  thread_ts           TEXT NOT NULL,
  message_ts          TEXT NOT NULL,
  marked_done         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT NOW() NOT NULL
)
`;

// ---------- Main ----------

async function main() {
  console.log("Connecting to Neon database...\n");

  let fixCount = 0;
  let errorCount = 0;

  try {
    // 1. Fetch all column info for knowledge_* tables
    const columns = await sql`
      SELECT
        table_name,
        column_name,
        is_nullable,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name LIKE 'knowledge_%'
      ORDER BY table_name, ordinal_position
    `;

    // Build lookup map
    const colMap = new Map();
    for (const row of columns) {
      colMap.set(`${row.table_name}.${row.column_name}`, row);
    }

    // Get list of existing tables
    const tableRows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'knowledge_%'
      ORDER BY table_name
    `;
    const existingTables = new Set(tableRows.map((r) => r.table_name));

    console.log("=== Existing knowledge_* tables ===");
    for (const t of existingTables) console.log(`  ${t}`);
    console.log();

    // 2. Check nullable expectations
    console.log("=== Nullability audit ===");
    const alterStatements = [];

    for (const exp of EXPECTED_NULLABLE) {
      const key = `${exp.table}.${exp.column}`;
      const actual = colMap.get(key);

      if (!actual) {
        if (existingTables.has(exp.table)) {
          console.log(`  MISSING  ${key} (column not found in existing table)`);
        }
        continue;
      }

      const actualNullable = actual.is_nullable === "YES";

      if (actualNullable !== exp.nullable) {
        const action = exp.nullable ? "DROP NOT NULL" : "SET NOT NULL";
        const stmt = `ALTER TABLE ${exp.table} ALTER COLUMN ${exp.column} ${action}`;
        console.log(`  MISMATCH ${key}: is_nullable=${actual.is_nullable}, expected ${exp.nullable ? "YES" : "NO"}`);
        console.log(`    → ${stmt};`);
        alterStatements.push({ stmt, key });
      } else {
        console.log(`  OK       ${key}: nullable=${actualNullable}`);
      }
    }

    // 3. Apply ALTER TABLE fixes
    if (alterStatements.length > 0) {
      console.log(`\n=== Applying ${alterStatements.length} ALTER TABLE fix(es) ===`);
      for (const { stmt, key } of alterStatements) {
        try {
          await sql.unsafe(stmt);
          console.log(`  ✅ Applied: ${stmt};`);
          fixCount++;
        } catch (err) {
          console.error(`  ❌ Failed: ${stmt};\n     ${err.message}`);
          errorCount++;
        }
      }
    } else {
      console.log("\n  All nullability checks passed — no ALTER TABLE needed.");
    }

    // 4. Create knowledge_digest_messages if missing
    console.log("\n=== Table creation ===");
    if (!existingTables.has("knowledge_digest_messages")) {
      console.log("  Creating knowledge_digest_messages...");
      try {
        await sql.unsafe(CREATE_DIGEST_MESSAGES);
        console.log("  ✅ knowledge_digest_messages created");
        fixCount++;
      } catch (err) {
        console.error(`  ❌ Failed to create knowledge_digest_messages: ${err.message}`);
        errorCount++;
      }
    } else {
      console.log("  ✅ knowledge_digest_messages already exists");

      // Verify expected columns exist
      const expectedDigestCols = [
        "id",
        "unit_id",
        "recipient_slack_id",
        "channel_id",
        "thread_ts",
        "message_ts",
        "marked_done",
        "created_at",
      ];
      let allCols = true;
      for (const col of expectedDigestCols) {
        const key = `knowledge_digest_messages.${col}`;
        if (!colMap.has(key)) {
          console.log(`  ⚠️  Missing column: ${key}`);
          allCols = false;
        }
      }
      if (allCols) {
        console.log("  ✅ All expected columns present in knowledge_digest_messages");
      }
    }

    // 5. Summary
    console.log(`\n=== Summary ===`);
    console.log(`  Tables found:    ${existingTables.size}`);
    console.log(`  Columns audited: ${EXPECTED_NULLABLE.length}`);
    console.log(`  Fixes applied:   ${fixCount}`);
    console.log(`  Errors:          ${errorCount}`);

    if (errorCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
