/**
 * Knowledge Hub — Knowledge Units API
 *
 * GET: Paginated list of units with filters.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeUnits, knowledgeChannels } from "@/lib/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const isAdmin = req.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const accountId = params.get("accountId");
  const unitType = params.get("type");
  const status = params.get("status");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [];
  if (accountId) conditions.push(eq(knowledgeUnits.accountId, accountId));
  if (unitType) conditions.push(eq(knowledgeUnits.unitType, unitType));
  if (status) {
    if (status === "dismissed") {
      conditions.push(eq(knowledgeUnits.status, "done"));
      conditions.push(sql`${knowledgeUnits.metadata}->>'dismissed' = 'true'`);
    } else {
      conditions.push(eq(knowledgeUnits.status, status));
    }
  }
  if (dateFrom) conditions.push(gte(knowledgeUnits.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(knowledgeUnits.createdAt, new Date(dateTo)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeUnits)
    .where(where);

  // Fetch page with channel name
  const units = await db
    .select({
      id: knowledgeUnits.id,
      accountId: knowledgeUnits.accountId,
      channelId: knowledgeUnits.channelId,
      unitType: knowledgeUnits.unitType,
      content: knowledgeUnits.content,
      author: knowledgeUnits.author,
      assignee: knowledgeUnits.assignee,
      requestedBy: knowledgeUnits.requestedBy,
      status: knowledgeUnits.status,
      dueDate: knowledgeUnits.dueDate,
      visibility: knowledgeUnits.visibility,
      confidence: knowledgeUnits.confidence,
      sourceEventIds: knowledgeUnits.sourceEventIds,
      metadata: knowledgeUnits.metadata,
      extractedAt: knowledgeUnits.extractedAt,
      createdAt: knowledgeUnits.createdAt,
      channelName: knowledgeChannels.slackChannelName,
    })
    .from(knowledgeUnits)
    .leftJoin(knowledgeChannels, eq(knowledgeChannels.id, knowledgeUnits.channelId))
    .where(where)
    .orderBy(desc(knowledgeUnits.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    units,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
}
