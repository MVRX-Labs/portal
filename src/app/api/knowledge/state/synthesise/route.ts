/**
 * Knowledge Hub — On-demand State Synthesis API
 *
 * POST: Triggers on-demand synthesis. Optional accountId, or all.
 */

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { knowledgeStateSynthesisOnDemand } from "@/trigger/knowledge-state-synthesis";
import { parseBodyOptional } from "@/lib/api-schemas/common";
import { triggerSynthesisBodySchema } from "@/lib/api-schemas/knowledge";

export async function POST(req: NextRequest) {
  try {
    const isAdmin = req.headers.get("x-user-admin") === "true";
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data } = await parseBodyOptional(req, triggerSynthesisBodySchema);

    const handle = await tasks.trigger<typeof knowledgeStateSynthesisOnDemand>(
      "knowledge-state-synthesis-on-demand",
      { accountId: data.accountId },
    );

    return NextResponse.json({ runId: handle.id });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Synthesis trigger failed: ${errMsg}` }, { status: 500 });
  }
}
