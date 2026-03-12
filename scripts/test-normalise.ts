/**
 * Test script for knowledge normalisation.
 * Usage: bash scripts/local-env.sh npx tsx scripts/test-normalise.ts [check|reset|run|run-one]
 */
import { db } from "@/lib/db";
import { knowledgeEvents, knowledgeUnits, knowledgeChannels } from "@/lib/schema";
import { eq, isNotNull, isNull, and } from "drizzle-orm";
import { normaliseChannel } from "@/lib/knowledge/normaliser";

const logger = {
  info: (m: string) => console.log(`[INFO] ${m}`),
  error: (m: string) => console.error(`[ERROR] ${m}`),
};

const mode = process.argv[2] || "check";

async function check() {
  const processed = await db.select({ id: knowledgeEvents.id }).from(knowledgeEvents).where(isNotNull(knowledgeEvents.processedAt));
  const unprocessed = await db.select({ id: knowledgeEvents.id }).from(knowledgeEvents).where(isNull(knowledgeEvents.processedAt));
  const units = await db
    .select({
      id: knowledgeUnits.id,
      type: knowledgeUnits.unitType,
      content: knowledgeUnits.content,
      assignee: knowledgeUnits.assignee,
      confidence: knowledgeUnits.confidence,
      accountId: knowledgeUnits.accountId,
      status: knowledgeUnits.status,
    })
    .from(knowledgeUnits);

  console.log(`Events: ${processed.length} processed, ${unprocessed.length} unprocessed`);
  console.log(`Knowledge units: ${units.length}`);

  if (units.length > 0) {
    const byType = new Map<string, number>();
    for (const u of units) byType.set(u.type, (byType.get(u.type) ?? 0) + 1);
    console.log("\nBy type:");
    for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    console.log("\nAll units:");
    for (const u of units) {
      console.log(`  [${u.type}] ${u.content.slice(0, 100)}${u.content.length > 100 ? "..." : ""}`);
      if (u.assignee) console.log(`    → assignee: ${u.assignee}`);
      console.log(`    → confidence: ${u.confidence}, status: ${u.status}`);
    }
  }
}

async function reset() {
  await db.update(knowledgeEvents).set({ processedAt: null });
  await db.delete(knowledgeUnits);
  console.log("Reset: all events cleared, units deleted");
}

async function run() {
  const channels = await db
    .select({ id: knowledgeChannels.id, name: knowledgeChannels.slackChannelName })
    .from(knowledgeChannels)
    .where(eq(knowledgeChannels.active, true));

  console.log(`Running normalisation on ${channels.length} channels\n`);
  let totalCost = 0;

  for (const channel of channels) {
    const result = await normaliseChannel(channel.id, logger);
    totalCost += result.cost;
    console.log(`\n#${result.channelName}: ${result.unitsExtracted} units, $${result.cost.toFixed(4)}, ${result.errors.length} errors`);
  }

  console.log(`\nTotal cost: $${totalCost.toFixed(4)}`);
}

async function runOne() {
  // Just the first channel with unprocessed events
  const channels = await db
    .select({ id: knowledgeChannels.id, name: knowledgeChannels.slackChannelName })
    .from(knowledgeChannels)
    .where(eq(knowledgeChannels.active, true));

  for (const channel of channels) {
    const [unproc] = await db
      .select({ id: knowledgeEvents.id })
      .from(knowledgeEvents)
      .where(and(eq(knowledgeEvents.channelId, channel.id), isNull(knowledgeEvents.processedAt)))
      .limit(1);

    if (unproc) {
      console.log(`Running normalisation on #${channel.name}\n`);
      const result = await normaliseChannel(channel.id, logger);
      console.log(`\n#${result.channelName}: ${result.unitsExtracted} units, $${result.cost.toFixed(4)}, ${result.errors.length} errors`);
      if (result.errors.length > 0) console.log("Errors:", result.errors);
      break;
    }
  }
}

async function main() {
  switch (mode) {
    case "check": await check(); break;
    case "reset": await reset(); break;
    case "run": await run(); break;
    case "run-one": await runOne(); break;
    default: console.log("Usage: check | reset | run | run-one");
  }
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
