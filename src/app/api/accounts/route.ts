import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq, ilike } from "drizzle-orm";
import { findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { slugify } from "@/lib/ids";

export const maxDuration = 300;

async function uniqueSlug(base: string): Promise<string> {
  let candidate = slugify(base);
  if (!candidate) candidate = "account";
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const slug = suffix === 0 ? candidate : `${candidate}-${suffix}`;
    const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.slug, slug)).limit(1);
    if (existing.length === 0) return slug;
    suffix++;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  const results = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      slug: accounts.slug,
      industry: accounts.industry,
      website: accounts.website,
      googleDriveFolderId: accounts.googleDriveFolderId,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .where(q ? ilike(accounts.name, `%${q}%`) : undefined)
    .orderBy(accounts.name);

  return NextResponse.json({ accounts: results });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, industry, website } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = await uniqueSlug(name);

  let googleDriveFolderId: string | null = null;
  try {
    const rootFolderId = getGeneratedMaterialsFolderId();
    googleDriveFolderId = await findOrCreateFolder(name, rootFolderId);
  } catch (err) {
    console.error("Failed to create Google Drive folder:", err);
  }

  const [account] = await db
    .insert(accounts)
    .values({
      name,
      slug,
      industry: industry || null,
      website: website || null,
      googleDriveFolderId,
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
}
