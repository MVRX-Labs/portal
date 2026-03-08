/**
 * Local end-to-end test: runs ingestion directly against the local DB.
 * Usage: npx tsx scripts/test-ingest-local.ts
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { knowledgeChannels, knowledgeEvents, knowledgeSyncState } from "../src/lib/schema";
import { ingestChannel } from "../src/lib/knowledge/ingest";
import { eq, count } from "drizzle-orm";

async function main() {
  console.log("=== Local Ingestion E2E Test ===\n");

  // 1. Check registered channels
  const channels = await db.select().from(knowledgeChannels);
  console.log(`Registered channels: ${channels.length}`);
  for (const ch of channels) {
    console.log(`  - ${ch.slackChannelName} (${ch.channelType}) → account ${ch.accountId}`);
  }

  if (channels.length === 0) {
    console.log("No channels registered. Register one first via the API.");
    process.exit(1);
  }

  // 2. Run ingestion on the first channel
  const channel = channels[0];
  console.log(`\nIngesting #${channel.slackChannelName}...`);

  const logger = {
    info: (msg: string) => console.log(`  [INFO] ${msg}`),
    error: (msg: string) => console.error(`  [ERROR] ${msg}`),
  };

  const result = await ingestChannel(channel.id, logger);

  console.log(`\nResults:`);
  console.log(`  New messages: ${result.newMessages}`);
  console.log(`  Thread replies: ${result.newThreadReplies}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log(`  Error details:`);
    result.errors.forEach((e) => console.log(`    - ${e}`));
  }

  // 3. Check what's in the DB
  const [eventCount] = await db
    .select({ count: count() })
    .from(knowledgeEvents)
    .where(eq(knowledgeEvents.channelId, channel.id));

  console.log(`\nTotal events in DB for this channel: ${eventCount.count}`);

  // 4. Sample some events
  const samples = await db
    .select({
      authorName: knowledgeEvents.authorName,
      authorSide: knowledgeEvents.authorSide,
      contentType: knowledgeEvents.contentType,
      visibility: knowledgeEvents.visibility,
      rawContent: knowledgeEvents.rawContent,
      messageAt: knowledgeEvents.messageAt,
      driveLinks: knowledgeEvents.driveLinks,
      threadRef: knowledgeEvents.threadRef,
    })
    .from(knowledgeEvents)
    .where(eq(knowledgeEvents.channelId, channel.id))
    .orderBy(knowledgeEvents.messageAt)
    .limit(10);

  console.log(`\nSample events (first 10 chronologically):`);
  for (const s of samples) {
    const ts = s.messageAt.toISOString().slice(0, 16);
    const side = s.authorSide ?? "?";
    const thread = s.threadRef ? " [thread]" : "";
    const drives = (s.driveLinks as string[])?.length ? ` [${(s.driveLinks as string[]).length} drive links]` : "";
    console.log(`  [${ts}] ${s.authorName} (${side}) | ${s.contentType}${thread}${drives}`);
    console.log(`    ${(s.rawContent ?? "").slice(0, 120)}`);
  }

  // 5. Check sync state
  const [sync] = await db
    .select()
    .from(knowledgeSyncState)
    .where(eq(knowledgeSyncState.channelId, channel.id));

  console.log(`\nSync state:`);
  console.log(`  Last message ts: ${sync.lastMessageTs}`);
  console.log(`  Last synced at: ${sync.lastSyncedAt?.toISOString()}`);
  console.log(`  Total ingested: ${sync.messagesIngested}`);
  console.log(`  Errors: ${sync.lastSyncError ?? "none"}`);

  // 6. Content type breakdown
  const types = await db
    .select({
      contentType: knowledgeEvents.contentType,
      cnt: count(),
    })
    .from(knowledgeEvents)
    .where(eq(knowledgeEvents.channelId, channel.id))
    .groupBy(knowledgeEvents.contentType)
    .orderBy(count());
  console.log(`\nContent type breakdown:`);
  for (const t of types) {
    console.log(`  ${t.contentType}: ${t.cnt}`);
  }

  // 7. Author breakdown
  const authors = await db
    .select({
      authorName: knowledgeEvents.authorName,
      authorSide: knowledgeEvents.authorSide,
      cnt: count(),
    })
    .from(knowledgeEvents)
    .where(eq(knowledgeEvents.channelId, channel.id))
    .groupBy(knowledgeEvents.authorName, knowledgeEvents.authorSide)
    .orderBy(count());
  console.log(`\nAuthor breakdown:`);
  for (const a of authors) {
    console.log(`  ${a.authorName} (${a.authorSide}): ${a.cnt}`);
  }

  console.log("\n=== Test complete ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
