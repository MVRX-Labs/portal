import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { icpDefinitions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchIcpDefinitionBodySchema } from "@/lib/api-schemas/icp-definitions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; icpId: string }> }) {
  const { id, icpId } = await params;
  const { data, error } = await parseBody(request, patchIcpDefinitionBodySchema);
  if (error) return error;

  const [icpDefinition] = await db
    .update(icpDefinitions)
    .set({ active: data.active, updatedAt: new Date() })
    .where(and(eq(icpDefinitions.id, icpId), eq(icpDefinitions.accountId, id)))
    .returning();

  if (!icpDefinition) {
    return NextResponse.json({ error: "ICP definition not found" }, { status: 404 });
  }

  return NextResponse.json({ icpDefinition });
}
