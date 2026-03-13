import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { linkedinSyncRuns } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const jobs = await db
      .select()
      .from(linkedinSyncRuns)
      .where(eq(linkedinSyncRuns.accountId, id))
      .orderBy(desc(linkedinSyncRuns.createdAt));
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
