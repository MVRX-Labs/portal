import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accountActions, users } from "@/lib/schema";
import { eq, ne, and } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createActionBodySchema } from "@/lib/api-schemas/actions";

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
  const { data, error } = await parseBody(request, createActionBodySchema);
  if (error) return error;

  const [action] = await db
    .insert(accountActions)
    .values({
      accountId: id,
      title: data.title,
      description: data.description || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assigneeId: data.assigneeId || null,
    })
    .returning();

  return NextResponse.json({ action }, { status: 201 });
}
