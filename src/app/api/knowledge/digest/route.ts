/**
 * Knowledge Hub — Digest API
 *
 * POST /api/knowledge/digest — trigger digest on-demand (via Trigger.dev task)
 * PATCH /api/knowledge/digest — update unit status (close/reopen items)
 */

import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { knowledgeUnits } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { updateUnitsBodySchema } from "@/lib/api-schemas/knowledge";

export async function POST(request: Request) {
  try {
    const handle = await tasks.trigger("knowledge-digest-on-demand", {});
    return NextResponse.json({ triggered: true, runId: handle.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { data, error } = await parseBody(request, updateUnitsBodySchema);
  if (error) return error;

  try {
    let updated = 0;
    for (const update of data.updates) {
      // Fetch existing metadata to merge, not overwrite
      const [existing] = await db
        .select({ metadata: knowledgeUnits.metadata })
        .from(knowledgeUnits)
        .where(eq(knowledgeUnits.id, update.unitId))
        .limit(1);

      const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};
      const isDismissed = update.status === "dismissed";
      const isDone = isDismissed || update.status === "done";

      await db
        .update(knowledgeUnits)
        .set({
          status: isDismissed ? "done" : update.status,
          metadata: isDone
            ? {
                ...existingMeta,
                ...(isDismissed ? { dismissed: true } : {}),
                completedAt: new Date().toISOString(),
              }
            : existingMeta,
        })
        .where(eq(knowledgeUnits.id, update.unitId));
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
