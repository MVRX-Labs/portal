import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { icpDefinitions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createIcpDefinitionBodySchema } from "@/lib/api-schemas/icp-definitions";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(icpDefinitions)
    .where(eq(icpDefinitions.accountId, id))
    .orderBy(icpDefinitions.createdAt);

  return NextResponse.json({ icpDefinitions: rows });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseBody(request, createIcpDefinitionBodySchema);
  if (error) return error;

  const [icpDefinition] = await db
    .insert(icpDefinitions)
    .values({
      accountId: id,
      name: data.name,
      description: data.description,
      targetTitles: data.targetTitles,
      targetIndustries: data.targetIndustries,
      targetCompanySizes: data.targetCompanySizes,
      targetSignals: data.targetSignals,
    })
    .returning();

  return NextResponse.json({ icpDefinition }, { status: 201 });
}
