import { NextRequest, NextResponse } from "next/server";
import { listJobs } from "@/lib/engagement-bot-db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const jobs = await listJobs(id);
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
