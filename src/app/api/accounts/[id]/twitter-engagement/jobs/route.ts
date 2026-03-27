import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { twitterSyncRuns } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const jobs = await db
      .select()
      .from(twitterSyncRuns)
      .where(eq(twitterSyncRuns.accountId, id))
      .orderBy(desc(twitterSyncRuns.createdAt));
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
