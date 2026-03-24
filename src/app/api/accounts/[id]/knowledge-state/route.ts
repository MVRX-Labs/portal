import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeState } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  const docs = await db
    .select({
      stateType: knowledgeState.stateType,
      content: knowledgeState.content,
      version: knowledgeState.version,
      updatedAt: knowledgeState.updatedAt,
    })
    .from(knowledgeState)
    .where(eq(knowledgeState.accountId, accountId));

  return NextResponse.json({ docs });
}
