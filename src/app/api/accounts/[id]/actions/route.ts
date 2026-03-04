import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accountActions, users } from "@/lib/schema";
import { eq, ne, and } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const includeCompleted = searchParams.get("includeCompleted") === "true";

  const conditions = [eq(accountActions.accountId, id)];
  if (!includeCompleted) {
    conditions.push(ne(accountActions.status, "completed"));
  }

  const actions = await db
    .select({
      id: accountActions.id,
      accountId: accountActions.accountId,
      title: accountActions.title,
      description: accountActions.description,
      status: accountActions.status,
      dueDate: accountActions.dueDate,
      assigneeId: accountActions.assigneeId,
      assigneeName: users.name,
      createdAt: accountActions.createdAt,
      updatedAt: accountActions.updatedAt,
    })
    .from(accountActions)
    .leftJoin(users, eq(accountActions.assigneeId, users.id))
    .where(and(...conditions))
    .orderBy(accountActions.createdAt);

  return NextResponse.json({ actions });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { title, description, dueDate, assigneeId } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const [action] = await db
    .insert(accountActions)
    .values({
      accountId: id,
      title,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      assigneeId: assigneeId || null,
    })
    .returning();

  return NextResponse.json({ action }, { status: 201 });
}
