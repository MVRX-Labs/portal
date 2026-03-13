import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { listLinkedinProfiles } from "@/lib/linkedin-profiles";
import type { linkedinSyncProfileTask } from "@/trigger/linkedin-sync";
import type { linkedinLeadUpsertTask } from "@/trigger/linkedin-lead-upsert";
import { parseBody } from "@/lib/api-schemas/common";
import { scrapeLeadsBodySchema } from "@/lib/api-schemas/leads";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const { data } = await parseBody(request, scrapeLeadsBodySchema).catch(() => ({
    data: {} as { contactId?: string; daysBack?: number },
    error: null,
  }));

  // Find all inbound-enabled profiles for this account
  let profiles = await listLinkedinProfiles(accountId, { inboundEnabled: true });

  // If a specific contactId was requested, filter to just that profile
  if (data.contactId) {
    profiles = profiles.filter((p) => p.contactId === data.contactId);
  }

  if (profiles.length === 0) {
    return NextResponse.json(
      {
        error: "No inbound profiles found. Add LinkedIn profiles with inbound lead discovery enabled first.",
      },
      { status: 400 }
    );
  }

  // Trigger sync (scrapes + populates engagement tables) for each profile
  const syncHandles = await tasks.batchTrigger<typeof linkedinSyncProfileTask>(
    "linkedin-sync-profile",
    profiles.map((p) => ({
      payload: { profileId: p.id, accountId },
    }))
  );

  // Also trigger lead upsert directly for immediate results from existing data
  const upsertHandles = await tasks.batchTrigger<typeof linkedinLeadUpsertTask>(
    "linkedin-lead-upsert",
    profiles.map((p) => ({
      payload: { profileId: p.id, accountId, contactId: p.contactId },
    }))
  );

  return NextResponse.json({
    triggered: profiles.length,
    syncBatchId: syncHandles.batchId,
    upsertBatchId: upsertHandles.batchId,
    profiles: profiles.map((p) => ({
      id: p.id,
      linkedinUrl: p.linkedinUrl,
      displayName: p.displayName,
    })),
  });
}
