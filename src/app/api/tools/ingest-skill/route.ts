import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk/v3";
import type { ingestSkillTask } from "@/trigger/ingest-skill";
import { parseBody } from "@/lib/api-schemas/common";
import { ingestSkillBodySchema } from "@/lib/api-schemas/skills";

async function fetchSkillMd(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch skill from ${url}: ${response.status}`);
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Skill content at ${url} is empty`);
  }
  return text;
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userName = request.headers.get("x-user-name") || "Unknown";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inputs, error } = await parseBody(request, ingestSkillBodySchema);
  if (error) return error;

  // Resolve skill content: fetch from URL or use provided markdown
  let skillMd: string;
  if (inputs.skillMd) {
    skillMd = inputs.skillMd;
  } else if (inputs.skillUrl) {
    try {
      skillMd = await fetchSkillMd(inputs.skillUrl);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Failed to fetch skill";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Either skillUrl or skillMd is required" }, { status: 400 });
  }

  const [run] = await db
    .insert(toolRuns)
    .values({
      tool: "ingest-skill",
      status: "running",
      inputs: {
        skillUrl: inputs.skillUrl,
        slug: inputs.slug,
        notes: inputs.notes,
        skillMdLength: skillMd.length,
      },
      userId,
    })
    .returning();

  try {
    const handle = await tasks.trigger<typeof ingestSkillTask>("ingest-skill", {
      runId: run.id,
      skillMd,
      slug: inputs.slug,
      notes: inputs.notes,
      userName,
    });

    await db
      .update(toolRuns)
      .set({ triggerRunId: handle.id })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "2h",
    });

    return NextResponse.json({
      id: run.id,
      status: "running",
      triggerRunId: handle.id,
      publicAccessToken,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db
      .update(toolRuns)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(toolRuns.id, run.id))
      .catch(() => {});

    return NextResponse.json({ id: run.id, error: errorMessage }, { status: 500 });
  }
}
