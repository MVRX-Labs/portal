import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { secretTypes } from "@/lib/schema";
import { parseBody } from "@/lib/api-schemas/common";
import { createSecretTypeBodySchema } from "@/lib/api-schemas/secrets";

export async function GET() {
  const results = await db.select().from(secretTypes).orderBy(secretTypes.name);
  return NextResponse.json({ secretTypes: results });
}

export async function POST(request: NextRequest) {
  const { data, error } = await parseBody(request, createSecretTypeBodySchema);
  if (error) return error;

  const [secretType] = await db.insert(secretTypes).values({ name: data.name }).returning();

  return NextResponse.json({ secretType }, { status: 201 });
}
