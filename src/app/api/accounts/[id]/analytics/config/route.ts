import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({
    analyticsSlackChannel: account.analyticsSlackChannel,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { analyticsSlackChannel } = body;

  if (typeof analyticsSlackChannel !== "string") {
    return NextResponse.json({ error: "analyticsSlackChannel must be a string" }, { status: 400 });
  }

  if (analyticsSlackChannel) {
    const ids = analyticsSlackChannel.split(",").map((s: string) => s.trim()).filter(Boolean);
    const invalid = ids.find((id: string) => !/^[CG][A-Z0-9]{8,}$/i.test(id));
    if (invalid) {
      return NextResponse.json({ error: `Invalid Slack channel ID: ${invalid}. Should look like C0AJLSV0M1A` }, { status: 400 });
    }
  }

  const channelValue = analyticsSlackChannel || null;

  const [account] = await db
    .update(accounts)
    .set({ analyticsSlackChannel: channelValue, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    analyticsSlackChannel: account.analyticsSlackChannel,
  });
}
