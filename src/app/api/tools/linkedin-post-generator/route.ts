import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, contacts, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { linkedinPostGeneratorTask } from "@/trigger/linkedin-post-generator";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let inputs: {
    contactId?: string;
    useLinkedinProfile?: string | boolean;
    sourceMaterial?: string;
    voiceContext?: string;
    model?: string;
    accountId?: string;
  };
  try {
    inputs = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!inputs.contactId || !inputs.sourceMaterial) {
    return NextResponse.json(
      { error: "contactId and sourceMaterial are required" },
      { status: 400 }
    );
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, inputs.contactId));

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const dynamicContact = contact as unknown as Record<string, unknown>;
  const posterRole =
    (typeof dynamicContact.role === "string" && dynamicContact.role) ||
    (typeof dynamicContact.title === "string" && dynamicContact.title) ||
    (typeof dynamicContact.jobTitle === "string" && dynamicContact.jobTitle) ||
    (typeof dynamicContact.headline === "string" && dynamicContact.headline) ||
    "Unknown role";

  const useLinkedinProfile =
    inputs.useLinkedinProfile === true ||
    inputs.useLinkedinProfile === "true";
  const linkedinUrl =
    useLinkedinProfile && contact.linkedinUrl ? contact.linkedinUrl : undefined;

  const accountId =
    typeof inputs.accountId === "string" ? inputs.accountId : null;

  let accountName: string | undefined;
  if (accountId) {
    const [account] = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    accountName = account?.name;
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-post-generator",
      status: "running",
      inputs: {
        ...inputs,
        contactName: contact.name,
        posterRole,
        linkedinUrl: linkedinUrl ?? null,
      },
      userId,
      accountId,
    })
    .returning();

  console.log(
    `[linkedin-post-generator:route][${run.id}] Run created (contact: ${contact.name}, useLinkedinProfile: ${useLinkedinProfile}, user: ${userName})`
  );

  try {
    const handle = await tasks.trigger<typeof linkedinPostGeneratorTask>(
      "linkedin-post-generator",
      {
        runId: run.id,
        posterName: contact.name,
        posterRole,
        sourceMaterial: inputs.sourceMaterial,
        voiceContext: inputs.voiceContext,
        linkedinUrl,
        useLinkedinProfile,
        model: inputs.model,
        accountName,
      }
    );

    console.log(
      `[linkedin-post-generator:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`
    );

    await db
      .update(toolRuns)
      .set({ triggerRunId: handle.id })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
    });

    return NextResponse.json({ id: run.id, status: "running", triggerRunId: handle.id, publicAccessToken });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    console.log(
      `[linkedin-post-generator:route][${run.id}] Failed to dispatch task: ${errorMessage}`
    );

    return NextResponse.json(
      { id: run.id, error: errorMessage },
      { status: 500 }
    );
  }
}
