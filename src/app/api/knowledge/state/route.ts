/**
 * Knowledge Hub — Account State API
 *
 * GET: Returns current state docs for an account.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeState } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "accountId query parameter required" }, { status: 400 });
  }

  const docs = await db.select().from(knowledgeState).where(eq(knowledgeState.accountId, accountId));

  return NextResponse.json({ docs });
}
