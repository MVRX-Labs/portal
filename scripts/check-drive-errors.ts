import { db } from "@/lib/db";
import { knowledgeEvents } from "@/lib/schema";
import { sql } from "drizzle-orm";

async function main() {
  const failed = await db.select({ id: knowledgeEvents.id, resolvedContent: knowledgeEvents.resolvedContent })
    .from(knowledgeEvents)
    .where(sql`${knowledgeEvents.resolvedContent} LIKE '%403%' OR ${knowledgeEvents.resolvedContent} LIKE '%Failed to fetch%'`);

  console.log("Events with failed Drive resolution:", failed.length);
  if (failed.length > 0) {
    // Clear failed resolution so they can be retried
    for (const evt of failed) {
      await db.update(knowledgeEvents).set({ resolvedContent: null }).where(sql`${knowledgeEvents.id} = ${evt.id}`);
    }
    console.log("Cleared resolvedContent on", failed.length, "events for retry");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
