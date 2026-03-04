import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accountActions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const { id, actionId } = await params;
  const body = await request.json();
  const { title, description, status, dueDate, assigneeId } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined) updates.assigneeId = assigneeId || null;

  const [action] = await db
    .update(accountActions)
    .set(updates)
    .where(and(eq(accountActions.id, actionId), eq(accountActions.accountId, id)))
    .returning();

  if (!action) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
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
