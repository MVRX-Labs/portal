/**
 * Knowledge Hub — Single Knowledge Unit API
 *
 * PATCH: Update a unit's status, content, or assignee.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeUnits, knowledgeChannels, accountActions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchUnitBodySchema } from "@/lib/api-schemas/knowledge";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = req.headers.get("x-user-admin") === "true";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  const { data, error } = await parseBody(req, patchUnitBodySchema);
  if (error) return error;

  // Build update object
  const updates: Record<string, unknown> = {};
  if (data.status !== undefined) {
    if (data.status === "dismissed") {
      updates.status = "done";
      updates.metadata = { dismissed: true };
    } else {
      updates.status = data.status;
    }
  }
  if (data.content !== undefined) updates.content = data.content;
  if (data.assignee !== undefined) updates.assignee = data.assignee;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(knowledgeUnits)
    .set(updates)
    .where(eq(knowledgeUnits.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  // Bidirectional sync: knowledge unit status → linked account action status
  if (data.status) {
    const effectiveStatus = updates.status as string; // "done" for both done & dismissed
    const actionStatus = effectiveStatus === "done" ? "completed" : "pending";
    await db
      .update(accountActions)
      .set({ status: actionStatus, updatedAt: new Date() })
      .where(eq(accountActions.knowledgeUnitId, id));
  }

  // Re-fetch with channel name for response
  const [unit] = await db
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
    .where(eq(knowledgeUnits.id, id))
    .limit(1);

  return NextResponse.json({ unit });
}
