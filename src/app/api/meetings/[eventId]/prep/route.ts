import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meetingPreps, calendarEventAccounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk/v3";
import type { meetingPrepGeneratorTask } from "@/trigger/meeting-prep-generator";

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const userId = request.headers.get("x-user-id");

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preps = await db
    .select()
    .from(meetingPreps)
    .where(eq(meetingPreps.eventId, eventId))
    .limit(1);

  if (preps.length === 0) {
    return NextResponse.json({ error: "No meeting prep found for this event" }, { status: 404 });
  }

  return NextResponse.json({ prep: preps[0] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const userId = request.headers.get("x-user-id");
  const userEmail = request.headers.get("x-user-email") || "";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up the linked account for this event
  const [linkedAccount] = await db
    .select({ accountId: calendarEventAccounts.accountId })
    .from(calendarEventAccounts)
    .where(eq(calendarEventAccounts.eventId, eventId))
    .limit(1);

  if (!linkedAccount) {
    return NextResponse.json(
      { error: "No account linked to this event. Meeting prep requires an associated account." },
      { status: 400 }
    );
  }

  try {
    const handle = await tasks.trigger<typeof meetingPrepGeneratorTask>("meeting-prep-generator", {
      eventId,
      accountId: linkedAccount.accountId,
      userId,
      userEmail,
    });

    return NextResponse.json({
      status: "generating",
      triggerRunId: handle.id,
      eventId,
      accountId: linkedAccount.accountId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
