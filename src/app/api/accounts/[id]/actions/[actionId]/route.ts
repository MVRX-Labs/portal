import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accountActions, knowledgeUnits } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { updateActionBodySchema } from "@/lib/api-schemas/actions";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const { id, actionId } = await params;
  const { data, error } = await parseBody(request, updateActionBodySchema);
  if (error) return error;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status;
  if (data.dueDate !== undefined) updates.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId || null;

  const [action] = await db
    .update(accountActions)
    .set(updates)
    .where(and(eq(accountActions.id, actionId), eq(accountActions.accountId, id)))
    .returning();

  if (!action) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  // Bidirectional sync: action status → linked knowledge unit status
  if (data.status && action.knowledgeUnitId) {
    const unitStatus = data.status === "completed" ? "done" : "open";
    await db
      .update(knowledgeUnits)
      .set({ status: unitStatus })
      .where(eq(knowledgeUnits.id, action.knowledgeUnitId));
  }

  return NextResponse.json({ action });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const { id, actionId } = await params;

  const [deleted] = await db
    .delete(accountActions)
    .where(and(eq(accountActions.id, actionId), eq(accountActions.accountId, id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
