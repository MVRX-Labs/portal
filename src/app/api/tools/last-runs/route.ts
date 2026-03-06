import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  // Get the latest run for each distinct tool using a subquery
  const latestPerTool = db
    .select({
      tool: toolRuns.tool,
      maxCreatedAt: sql<Date>`max(${toolRuns.createdAt})`.as("max_created_at"),
    })
    .from(toolRuns)
    .groupBy(toolRuns.tool)
    .as("latest");

  const rows = await db
    .select({
      tool: toolRuns.tool,
      status: toolRuns.status,
      createdAt: toolRuns.createdAt,
      updatedAt: toolRuns.updatedAt,
    })
    .from(toolRuns)
    .innerJoin(
      latestPerTool,
      sql`${toolRuns.tool} = ${latestPerTool.tool} and ${toolRuns.createdAt} = ${latestPerTool.maxCreatedAt}`
    );

  const lastRuns: Record<string, { status: string; createdAt: string; updatedAt: string }> = {};
  for (const row of rows) {
    lastRuns[row.tool] = {
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  return NextResponse.json(lastRuns);
}
