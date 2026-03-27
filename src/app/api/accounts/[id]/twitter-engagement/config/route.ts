import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchTwitterEngagementConfigBodySchema } from "@/lib/api-schemas/twitter-engagement";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({
    twitterEngagementSlackChannel: account.twitterEngagementSlackChannel,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseBody(request, patchTwitterEngagementConfigBodySchema);
  if (error) return error;

  const { twitterEngagementSlackChannel } = data;

  if (twitterEngagementSlackChannel && !/^[CG][A-Z0-9]{8,}$/i.test(twitterEngagementSlackChannel)) {
    return NextResponse.json(
      { error: "Invalid Slack channel ID format. Should look like C0AJLSV0M1A" },
      { status: 400 }
    );
  }

  const channelValue = twitterEngagementSlackChannel || null;

  const [account] = await db
    .update(accounts)
    .set({ twitterEngagementSlackChannel: channelValue, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    twitterEngagementSlackChannel: account.twitterEngagementSlackChannel,
  });
}
