import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/engagement-bot-db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const posts = await listPosts(id);
    return NextResponse.json(posts);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
