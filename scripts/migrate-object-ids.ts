/**
 * One-time migration to add object ID prefixes to all existing records.
 *
 * Prefixes:
 *   users.id       → user_<cuid>
 *   accounts.id    → acct_<cuid>
 *   contacts.id    → contact_<cuid>
 *   tool_runs.id   → run_<cuid>
 *
 * Also updates all foreign key references (user_id, account_id in tool_runs
 * and account_id in contacts).
 *
 * Safe to run multiple times — skips rows that already have the correct prefix.
 * Also handles migration from old prefixes (usr_, ctc_) to new ones.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const sql = postgres(process.env.STORAGE_DATABASE_URL!);

const hasPrefix = (col: string) => `strpos(${col}, '_') > 0`;
const noPrefix = (col: string) => `strpos(${col}, '_') = 0`;

async function migrate() {
  console.log("Migrating IDs to object ID format...\n");

  // Temporarily drop FK constraints so we can update PKs and FKs independently
  await sql`ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS tool_runs_user_id_users_id_fk`;
  await sql`ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS tool_runs_account_id_accounts_id_fk`;
  await sql`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_account_id_accounts_id_fk`;

  // 1. Users: bare CUID → user_, old prefix usr_ → user_
  const userBare = await sql.unsafe(`UPDATE users SET id = 'user_' || id WHERE ${noPrefix('id')}`);
  const userRename = await sql.unsafe(`UPDATE users SET id = 'user_' || substring(id from 5) WHERE id LIKE 'usr\\_%'`);
  const userFkBare = await sql.unsafe(`UPDATE tool_runs SET user_id = 'user_' || user_id WHERE ${noPrefix('user_id')}`);
  const userFkRename = await sql.unsafe(`UPDATE tool_runs SET user_id = 'user_' || substring(user_id from 5) WHERE user_id LIKE 'usr\\_%'`);
  console.log(`  users: ${userBare.count + userRename.count} PK(s), ${userFkBare.count + userFkRename.count} FK ref(s)`);

  // 2. Accounts: bare CUID → acct_ (no prefix rename needed)
  const acctBare = await sql.unsafe(`UPDATE accounts SET id = 'acct_' || id WHERE ${noPrefix('id')}`);
  const acctFkContacts = await sql.unsafe(`UPDATE contacts SET account_id = 'acct_' || account_id WHERE ${noPrefix('account_id')}`);
  const acctFkRuns = await sql.unsafe(`UPDATE tool_runs SET account_id = 'acct_' || account_id WHERE account_id IS NOT NULL AND ${noPrefix('account_id')}`);
  console.log(`  accounts: ${acctBare.count} PK(s), ${acctFkContacts.count + acctFkRuns.count} FK ref(s)`);

  // 3. Contacts: bare CUID → contact_, old prefix ctc_ → contact_
  const ctcBare = await sql.unsafe(`UPDATE contacts SET id = 'contact_' || id WHERE ${noPrefix('id')}`);
  const ctcRename = await sql.unsafe(`UPDATE contacts SET id = 'contact_' || substring(id from 5) WHERE id LIKE 'ctc\\_%'`);
  console.log(`  contacts: ${ctcBare.count + ctcRename.count} PK(s)`);

  // 4. Tool runs: bare CUID → run_ (no prefix rename needed)
  const runBare = await sql.unsafe(`UPDATE tool_runs SET id = 'run_' || id WHERE ${noPrefix('id')}`);
  console.log(`  tool_runs: ${runBare.count} PK(s)`);

  // Re-add FK constraints
  await sql`
    ALTER TABLE tool_runs ADD CONSTRAINT tool_runs_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
  `;
  await sql`
    ALTER TABLE tool_runs ADD CONSTRAINT tool_runs_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE NO ACTION ON UPDATE NO ACTION
  `;
  await sql`
    ALTER TABLE contacts ADD CONSTRAINT contacts_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE NO ACTION ON UPDATE NO ACTION
  `;

  console.log("\nMigration complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
