import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchEngagementConfigBodySchema } from "@/lib/api-schemas/engagement";

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
  const { data, error } = await parseBody(request, patchEngagementConfigBodySchema);
  if (error) return error;

  const { engagementSlackChannel } = data;

  if (engagementSlackChannel && !/^[CG][A-Z0-9]{8,}$/i.test(engagementSlackChannel)) {
    return NextResponse.json(
      { error: "Invalid Slack channel ID format. Should look like C0AJLSV0M1A" },
      { status: 400 }
    );
  }

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
