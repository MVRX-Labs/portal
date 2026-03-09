import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

async function getBuildId() {
  try {
    return (await readFile(join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
  } catch {
    return process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
  }
}

export async function GET() {
  const buildId = await getBuildId();

  return NextResponse.json(
    { buildId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
