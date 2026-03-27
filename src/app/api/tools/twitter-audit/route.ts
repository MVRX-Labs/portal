import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts, contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { twitterAuditTask } from "@/trigger/twitter-audit";
import { parseBody } from "@/lib/api-schemas/common";
import { twitterAuditBodySchema } from "@/lib/api-schemas/tools";
import { getContactTwitterUrl } from "@/lib/twitter-profiles";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, twitterAuditBodySchema);
  if (error) return error;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, inputs.contactId));

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const twitterUrl = await getContactTwitterUrl(contact.id);
  if (!twitterUrl) {
    return NextResponse.json({ error: "Selected contact has no Twitter/X URL" }, { status: 400 });
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, inputs.accountId));
  const companyName = account?.name || "Unknown";

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "twitter-audit",
      status: "running",
      inputs: { ...inputs, twitterUrl, companyName, contactName: contact.name },
      userId,
      accountId: inputs.accountId,
    })
    .returning();

  console.log(
    `[twitter-audit:route][${run.id}] Run created for "${twitterUrl}" (contact: ${contact.name}, account: ${companyName}, user: ${userName})`
  );

  try {
    const handle = await tasks.trigger<typeof twitterAuditTask>("twitter-audit-generation", {
      runId: run.id,
      twitterUrl,
      accountName: companyName,
      model: inputs.model,
    });

    console.log(`[twitter-audit:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

    await db
      .update(toolRuns)
      .set({ triggerRunId: handle.id })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
    });

    return NextResponse.json({
      id: run.id,
      status: "running",
      triggerRunId: handle.id,
      publicAccessToken,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(`[twitter-audit:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
