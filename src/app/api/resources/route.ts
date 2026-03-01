import { NextRequest, NextResponse } from "next/server";
import { listFiles } from "@/lib/gdrive";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId") || undefined;
  const accountId = searchParams.get("accountId") || undefined;

  let rootFolderId = folderId;

  // If no explicit folderId but we have an accountId, use the account's Drive folder
  if (!rootFolderId && accountId) {
    try {
      const [account] = await db
        .select({ googleDriveFolderId: accounts.googleDriveFolderId })
        .from(accounts)
        .where(eq(accounts.id, accountId));
      if (account?.googleDriveFolderId) {
        rootFolderId = account.googleDriveFolderId;
      }
    } catch {
      // fall through to default
    }
  }

  try {
    const files = await listFiles(rootFolderId);
    return NextResponse.json({ files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
