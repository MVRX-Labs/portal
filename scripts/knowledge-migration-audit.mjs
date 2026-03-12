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

// Fix 4: Never hardcode production credentials — require env var
const DATABASE_URL = process.env.DATABASE_URL || process.env.PROD_STORAGE_DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "Error: No database URL configured.\n" +
      "Set DATABASE_URL or PROD_STORAGE_DATABASE_URL as an environment variable before running this script.\n" +
      "Example: PROD_STORAGE_DATABASE_URL=postgresql://... node scripts/knowledge-migration-audit.mjs",
  );
  process.exit(1);
}

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
  marked_done         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT knowledge_digest_messages_unit_id_recipient_slack_id_unique UNIQUE (unit_id, recipient_slack_id)
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

      // Fix 8: Ensure marked_done is NOT NULL on existing table
      console.log("\n=== knowledge_digest_messages constraints ===");
      const markedDoneCol = colMap.get("knowledge_digest_messages.marked_done");
      if (markedDoneCol && markedDoneCol.is_nullable === "YES") {
        console.log("  MISMATCH knowledge_digest_messages.marked_done: is_nullable=YES, expected NO");
        const stmt = "ALTER TABLE knowledge_digest_messages ALTER COLUMN marked_done SET NOT NULL";
        // First backfill any NULLs so the constraint can be applied
        const backfillStmt = "UPDATE knowledge_digest_messages SET marked_done = FALSE WHERE marked_done IS NULL";
        try {
          await sql.unsafe(backfillStmt);
          await sql.unsafe(stmt);
          console.log("  ✅ Applied: marked_done SET NOT NULL");
          fixCount++;
        } catch (err) {
          console.error(`  ❌ Failed to set marked_done NOT NULL: ${err.message}`);
          errorCount++;
        }
      } else {
        console.log("  ✅ marked_done: NOT NULL already");
      }

      // Fix 5: Ensure unique constraint on (unit_id, recipient_slack_id)
      const existingConstraints = await sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_digest_messages'
          AND constraint_type = 'UNIQUE'
      `;
      const constraintNames = new Set(existingConstraints.map((r) => r.constraint_name));
      const hasUniqueUnitRecipient = [...constraintNames].some(
        (n) => n.includes("unit") && n.includes("recipient"),
      );

      if (!hasUniqueUnitRecipient) {
        console.log("  MISSING unique constraint on (unit_id, recipient_slack_id)");
        const stmt =
          "ALTER TABLE knowledge_digest_messages ADD CONSTRAINT knowledge_digest_messages_unit_recipient_unique UNIQUE (unit_id, recipient_slack_id)";
        try {
          await sql.unsafe(stmt);
          console.log("  ✅ Added unique constraint on (unit_id, recipient_slack_id)");
          fixCount++;
        } catch (err) {
          console.error(`  ❌ Failed to add unique constraint: ${err.message}`);
          errorCount++;
        }
      } else {
        console.log("  ✅ Unique constraint on (unit_id, recipient_slack_id) already exists");
      }

      // Fix 5: Ensure index on (channel_id, message_ts)
      const existingIndexes = await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'knowledge_digest_messages'
      `;
      const indexNames = new Set(existingIndexes.map((r) => r.indexname));
      if (!indexNames.has("knowledge_digest_messages_channel_message_ts_idx")) {
        console.log("  MISSING index on (channel_id, message_ts)");
        const stmt =
          "CREATE INDEX knowledge_digest_messages_channel_message_ts_idx ON knowledge_digest_messages (channel_id, message_ts)";
        try {
          await sql.unsafe(stmt);
          console.log("  ✅ Created index on (channel_id, message_ts)");
          fixCount++;
        } catch (err) {
          console.error(`  ❌ Failed to create index: ${err.message}`);
          errorCount++;
        }
      } else {
        console.log("  ✅ Index on (channel_id, message_ts) already exists");
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
