import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leadCsvs } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; csvId: string }> }) {
  const { id: accountId, csvId } = await params;

  const [record] = await db
    .select({
      filename: leadCsvs.filename,
      csvContent: leadCsvs.csvContent,
    })
    .from(leadCsvs)
    .where(and(eq(leadCsvs.id, csvId), eq(leadCsvs.accountId, accountId)))
    .limit(1);

  if (!record) {
    return NextResponse.json({ error: "CSV not found" }, { status: 404 });
  }

  return new NextResponse(record.csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${record.filename}"`,
    },
  });
}
