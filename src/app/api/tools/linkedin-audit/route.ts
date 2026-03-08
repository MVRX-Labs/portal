import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, accounts, contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { linkedinAuditTask } from "@/trigger/linkedin-audit";
import { parseBody } from "@/lib/api-schemas/common";
import { linkedinAuditBodySchema } from "@/lib/api-schemas/tools";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, linkedinAuditBodySchema);
  if (error) return error;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, inputs.contactId));

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.linkedinUrl) {
    return NextResponse.json({ error: "Selected contact has no LinkedIn URL" }, { status: 400 });
  }

  let companyName = "Unknown";
  if (inputs.accountId) {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, inputs.accountId));
    if (account) companyName = account.name;
  }

  const linkedinUrl = contact.linkedinUrl;

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-audit",
      status: "running",
      inputs: { ...inputs, linkedinUrl, companyName, contactName: contact.name },
      userId,
      accountId: inputs.accountId || null,
    })
    .returning();

  console.log(
    `[linkedin-audit:route][${run.id}] Run created for "${linkedinUrl}" (contact: ${contact.name}, account: ${companyName}, user: ${userName})`
  );

  try {
    const handle = await tasks.trigger<typeof linkedinAuditTask>("linkedin-audit-generation", {
      runId: run.id,
      linkedinUrl,
      accountName: inputs.accountId ? companyName : undefined,
      model: inputs.model,
    });

    console.log(`[linkedin-audit:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

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

    console.log(`[linkedin-audit:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
