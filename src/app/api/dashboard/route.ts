import { NextResponse } from "next/server";
import { getOrgDashboardData } from "@/lib/org-dashboard-data";

export async function GET() {
  try {
    return NextResponse.json(await getOrgDashboardData());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
