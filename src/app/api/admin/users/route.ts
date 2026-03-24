import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { createUserBodySchema, updateUserBodySchema } from "@/lib/api-schemas/admin";

export const maxDuration = 300;

export async function GET() {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users);

  return NextResponse.json({ users: allUsers });
}

export async function POST(request: NextRequest) {
  const { data, error } = await parseBody(request, createUserBodySchema);
  if (error) return error;

  try {
    const [user] = await db.insert(users).values({ name: data.name, email: data.email }).returning({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function PUT(request: NextRequest) {
  const { data, error } = await parseBody(request, updateUserBodySchema);
  if (error) return error;

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.email !== undefined) updates.email = data.email;

  const [user] = await db.update(users).set(updates).where(eq(users.id, data.id)).returning({
    id: users.id,
    name: users.name,
    email: users.email,
    createdAt: users.createdAt,
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });

  if (!deleted) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
