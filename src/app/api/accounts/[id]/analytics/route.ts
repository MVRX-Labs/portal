import { NextRequest, NextResponse } from "next/server";
import { getAccountAnalytics } from "@/lib/analytics-report";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  try {
    return NextResponse.json(await getAccountAnalytics(accountId));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
