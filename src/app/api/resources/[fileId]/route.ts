import { NextRequest, NextResponse } from "next/server";
import { getFile, exportFileContent, getPreviewUrl } from "@/lib/gdrive";

export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "export") {
      const content = await exportFileContent(fileId);
      return NextResponse.json({ content });
    }

    const file = await getFile(fileId);
    const previewUrl = getPreviewUrl(fileId, file.mimeType);

    return NextResponse.json({ file, previewUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
