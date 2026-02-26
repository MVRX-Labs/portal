import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, users } from "@/lib/schema";
import { desc, eq, and, SQL } from "drizzle-orm";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "100"));
  const toolFilter = searchParams.get("tool");
  const userFilter = searchParams.get("user");
  const statusFilter = searchParams.get("status");

  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (toolFilter) conditions.push(eq(toolRuns.tool, toolFilter));
  if (userFilter) conditions.push(eq(toolRuns.userId, userFilter));
  if (statusFilter) conditions.push(eq(toolRuns.status, statusFilter));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const runs = await db
    .select({
      id: toolRuns.id,
      tool: toolRuns.tool,
      status: toolRuns.status,
      inputs: toolRuns.inputs,
      outputUrl: toolRuns.outputUrl,
      error: toolRuns.error,
      userId: toolRuns.userId,
      userName: users.name,
      createdAt: toolRuns.createdAt,
      updatedAt: toolRuns.updatedAt,
    })
    .from(toolRuns)
    .leftJoin(users, eq(toolRuns.userId, users.id))
    .where(where)
    .orderBy(desc(toolRuns.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ runs, page, limit });
}
