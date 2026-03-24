import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { secrets, accounts, contacts, secretTypes } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { updateSecretBodySchema } from "@/lib/api-schemas/secrets";

function selectSecretWithJoins() {
  return db
    .select({
      id: secrets.id,
      accountId: secrets.accountId,
      contactId: secrets.contactId,
      typeId: secrets.typeId,
      typeName: secretTypes.name,
      name: secrets.name,
      value: secrets.value,
      description: secrets.description,
      accountName: accounts.name,
      contactName: contacts.name,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .innerJoin(accounts, eq(secrets.accountId, accounts.id))
    .innerJoin(secretTypes, eq(secrets.typeId, secretTypes.id))
    .leftJoin(contacts, eq(secrets.contactId, contacts.id));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseBody(request, updateSecretBodySchema);
  if (error) return error;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.value !== undefined) updates.value = data.value;
  if (data.description !== undefined) updates.description = data.description;
  if (data.typeId !== undefined) updates.typeId = data.typeId;
  if (data.contactId !== undefined) updates.contactId = data.contactId;

  await db.update(secrets).set(updates).where(eq(secrets.id, id));

  const [secret] = await selectSecretWithJoins().where(eq(secrets.id, id));

  if (!secret) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  return NextResponse.json({ secret });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [deleted] = await db.delete(secrets).where(eq(secrets.id, id)).returning();

  if (!deleted) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
