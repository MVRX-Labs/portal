import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns, contacts, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { linkedinPostGeneratorTask } from "@/trigger/linkedin-post-generator";
import { parseBody } from "@/lib/api-schemas/common";
import { linkedinPostGeneratorBodySchema } from "@/lib/api-schemas/tools";
import { getContactLinkedinUrl } from "@/lib/linkedin-profiles";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, linkedinPostGeneratorBodySchema);
  if (error) return error;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, inputs.contactId));

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

  const useLinkedinProfile = inputs.useLinkedinProfile === true || inputs.useLinkedinProfile === "true";
  const contactLinkedinUrl = useLinkedinProfile ? await getContactLinkedinUrl(contact.id) : null;
  const linkedinUrl = contactLinkedinUrl ?? undefined;
  const [account] = await db
    .select({ name: accounts.name, contentVoiceGuidance: accounts.contentVoiceGuidance })
    .from(accounts)
    .where(eq(accounts.id, inputs.accountId));
  const accountName = account?.name;
  const accountContentVoiceGuidance = account?.contentVoiceGuidance ?? null;

  const resolvedVoiceContext = [
    accountContentVoiceGuidance ? `Account-level content voice guidance:\n${accountContentVoiceGuidance}` : null,
    contact.contentVoiceGuidance ? `Contact-level content voice guidance:\n${contact.contentVoiceGuidance}` : null,
    inputs.voiceContext ? `Run-specific voice context:\n${inputs.voiceContext}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "linkedin-post-generator",
      status: "running",
      inputs: {
        ...inputs,
        contactName: contact.name,
        posterRole,
        accountId: inputs.accountId,
        linkedinUrl: linkedinUrl ?? null,
        accountContentVoiceGuidance,
        contactContentVoiceGuidance: contact.contentVoiceGuidance ?? null,
        resolvedVoiceContext: resolvedVoiceContext || null,
      },
      userId,
      accountId: inputs.accountId,
    })
    .returning();

  console.log(
    `[linkedin-post-generator:route][${run.id}] Run created (contact: ${contact.name}, useLinkedinProfile: ${useLinkedinProfile}, user: ${userName})`
  );

  try {
    const handle = await tasks.trigger<typeof linkedinPostGeneratorTask>("linkedin-post-generator", {
      runId: run.id,
      posterName: contact.name,
      posterRole,
      sourceMaterial: inputs.sourceMaterial,
      voiceContext: resolvedVoiceContext || undefined,
      linkedinUrl,
      useLinkedinProfile,
      model: inputs.model,
      accountName,
      promptStyle: inputs.promptStyle,
      customPrompt: inputs.customPrompt,
    });

    console.log(`[linkedin-post-generator:route][${run.id}] Trigger.dev task dispatched (handle: ${handle.id})`);

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

    console.log(`[linkedin-post-generator:route][${run.id}] Failed to dispatch task: ${errorMessage}`);

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
