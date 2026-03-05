import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { escapeCsv } from "@/lib/csv";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get("contactId") || null;

  const conditions = [eq(leads.accountId, accountId)];
  if (contactId) {
    conditions.push(eq(leads.contactId, contactId));
  }

  const rows = await db
    .select({
      firstName: leads.firstName,
      lastName: leads.lastName,
      linkedinUrl: leads.linkedinUrl,
      headline: leads.headline,
      company: leads.company,
    })
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.lastSeenAt));

  // Build CSV in HeyReach-compatible format
  const headers = ["firstName", "lastName", "LinkedInProfileUrl", "headline", "company"];
  const csvRows = [headers.join(",")];

  for (const row of rows) {
    const values = [
      escapeCsv(row.firstName),
      escapeCsv(row.lastName || ""),
      escapeCsv(row.linkedinUrl),
      escapeCsv(row.headline || ""),
      escapeCsv(row.company || ""),
    ];
    csvRows.push(values.join(","));
  }

  const csv = csvRows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="leads-export.csv"`,
    },
  });
}
