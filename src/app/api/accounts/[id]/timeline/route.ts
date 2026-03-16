import { NextRequest, NextResponse } from "next/server";
import { getAccountTimeline } from "@/lib/account-timeline";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;
  const searchParams = request.nextUrl.searchParams;

  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
  );
  const beforeParam = searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : undefined;

  if (before && isNaN(before.getTime())) {
    return NextResponse.json(
      { error: "Invalid 'before' cursor — expected ISO date string" },
      { status: 400 }
    );
  }

  try {
    const result = await getAccountTimeline(accountId, limit, before);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Timeline fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}
