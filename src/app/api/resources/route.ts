import { NextRequest, NextResponse } from "next/server";
import { listFiles } from "@/lib/gdrive";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId") || undefined;

  try {
    const files = await listFiles(folderId);
    return NextResponse.json({ files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
