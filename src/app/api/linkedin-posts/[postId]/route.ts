import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { linkedinPosts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/api-schemas/common";
import { patchLinkedinPostBodySchema } from "@/lib/api-schemas/post-categories";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;

  const { data, error } = await parseBody(request, patchLinkedinPostBodySchema);
  if (error) return error;

  const [post] = await db.select({ id: linkedinPosts.id }).from(linkedinPosts).where(eq(linkedinPosts.id, postId));

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await db.update(linkedinPosts).set({ category: data.category }).where(eq(linkedinPosts.id, postId));

  return NextResponse.json({ ok: true, category: data.category });
}
