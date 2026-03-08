/**
 * Test script: Voice transcription + Drive link resolution.
 * Usage: npx tsx scripts/test-resolve-media.ts
 *
 * Loads .env.local, overrides STORAGE_DATABASE_URL for local Docker DB.
 */

// Load .env.local BEFORE any module imports that use process.env at init time.
// dotenv must run first so STORAGE_DATABASE_URL is available when db.ts loads.
import { config } from "dotenv";
config({ path: ".env.local", override: true });
// Override DB URL for local Docker
process.env.STORAGE_DATABASE_URL = "postgres://mvrx:mvrx@localhost:5433/mvrx";

import { transcribeVoiceNotes } from "../src/lib/knowledge/transcribe";
import { resolveDriveLinks } from "../src/lib/knowledge/drive-resolver";

const logger = {
  info: (m: string) => console.log(`[INFO] ${m}`),
  error: (m: string) => console.error(`[ERROR] ${m}`),
};

async function main() {
  console.log("=== Media Resolution Test ===\n");

  // Phase 1: Voice notes
  console.log("--- Phase 1: Voice Note Transcription ---");
  const vResult = await transcribeVoiceNotes(undefined, logger);
  console.log(`\nTranscribed: ${vResult.transcribed}, Errors: ${vResult.errors.length}`);
  if (vResult.errors.length) vResult.errors.forEach((e) => console.log(`  - ${e}`));

  // Phase 2: Drive links
  console.log("\n--- Phase 2: Drive Link Resolution ---");
  const dResult = await resolveDriveLinks(undefined, logger);
  console.log(`\nResolved: ${dResult.resolved}, Errors: ${dResult.errors.length}`);
  if (dResult.errors.length) dResult.errors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
