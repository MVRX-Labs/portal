import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { secrets, accounts, contacts, secretTypes } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createSecretBodySchema } from "@/lib/api-schemas/secrets";

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");

  const query = selectSecretWithJoins();
  const results = accountId
    ? await query.where(eq(secrets.accountId, accountId)).orderBy(accounts.name, secrets.name)
    : await query.orderBy(accounts.name, secrets.name);

  return NextResponse.json({ secrets: results });
}

export async function POST(request: NextRequest) {
  const { data, error } = await parseBody(request, createSecretBodySchema);
  if (error) return error;

  const [created] = await db
    .insert(secrets)
    .values({
      accountId: data.accountId,
      contactId: data.contactId || null,
      typeId: data.typeId,
      name: data.name,
      value: data.value,
      description: data.description || null,
    })
    .returning();

  const [secret] = await selectSecretWithJoins().where(eq(secrets.id, created.id));

  return NextResponse.json({ secret }, { status: 201 });
}
