/**
 * Knowledge Hub — Pipeline Stats API
 *
 * GET: Returns aggregate stats for the knowledge pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeEvents, knowledgeUnits } from "@/lib/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const isAdmin = req.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Total events
  const [{ totalEvents }] = await db
    .select({ totalEvents: sql<number>`count(*)::int` })
    .from(knowledgeEvents);

  // Total units + open/done breakdown
  const [{ totalUnits }] = await db
    .select({ totalUnits: sql<number>`count(*)::int` })
    .from(knowledgeUnits);

  const [{ openUnits }] = await db
    .select({ openUnits: sql<number>`count(*)::int` })
    .from(knowledgeUnits)
    .where(eq(knowledgeUnits.status, "open"));

  const doneUnits = totalUnits - openUnits;

  // Last ingest time (latest event createdAt)
  const [lastIngest] = await db
    .select({ at: knowledgeEvents.createdAt })
    .from(knowledgeEvents)
    .orderBy(desc(knowledgeEvents.createdAt))
    .limit(1);

  // Last normalise time (latest processedAt)
  const [lastNormalise] = await db
    .select({ at: knowledgeEvents.processedAt })
    .from(knowledgeEvents)
    .where(sql`${knowledgeEvents.processedAt} IS NOT NULL`)
    .orderBy(desc(knowledgeEvents.processedAt))
    .limit(1);

  // Last digest time (latest digest message)
  const { knowledgeDigestMessages } = await import("@/lib/schema");
  const [lastDigest] = await db
    .select({ at: knowledgeDigestMessages.createdAt })
    .from(knowledgeDigestMessages)
    .orderBy(desc(knowledgeDigestMessages.createdAt))
    .limit(1);

  return NextResponse.json({
    stats: {
      totalEvents,
      totalUnits,
      openUnits,
      doneUnits,
      lastIngestAt: lastIngest?.at ?? null,
      lastNormaliseAt: lastNormalise?.at ?? null,
      lastDigestAt: lastDigest?.at ?? null,
    },
  });
}
