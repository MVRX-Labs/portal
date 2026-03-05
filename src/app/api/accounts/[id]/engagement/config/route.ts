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
    engagementSlackChannel: account.engagementSlackChannel,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { engagementSlackChannel } = body;

  if (typeof engagementSlackChannel !== "string") {
    return NextResponse.json({ error: "engagementSlackChannel must be a string" }, { status: 400 });
  }

  // Validate Slack channel ID format (C/G followed by alphanumeric, or empty to clear)
  if (engagementSlackChannel && !/^[CG][A-Z0-9]{8,}$/i.test(engagementSlackChannel)) {
    return NextResponse.json({ error: "Invalid Slack channel ID format. Should look like C0AJLSV0M1A" }, { status: 400 });
  }

  // Store null instead of empty string to keep isNotNull queries clean
  const channelValue = engagementSlackChannel || null;

  const [account] = await db
    .update(accounts)
    .set({ engagementSlackChannel: channelValue, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    engagementSlackChannel: account.engagementSlackChannel,
  });
}
