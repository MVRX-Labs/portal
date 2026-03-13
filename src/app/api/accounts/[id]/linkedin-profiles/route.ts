import { NextRequest, NextResponse } from "next/server";
import { listLinkedinProfiles } from "@/lib/linkedin-profiles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const profiles = await listLinkedinProfiles(accountId);
  return NextResponse.json({ profiles });
}
