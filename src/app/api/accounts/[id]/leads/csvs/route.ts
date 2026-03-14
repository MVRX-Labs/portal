import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leadCsvs, contacts, linkedinProfiles } from "@/lib/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const where = eq(leadCsvs.accountId, accountId);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: leadCsvs.id,
        accountId: leadCsvs.accountId,
        contactId: leadCsvs.contactId,
        contactName: contacts.name,
        profileName: linkedinProfiles.displayName,
        scrapeWindow: leadCsvs.scrapeWindow,
        description: leadCsvs.description,
        filename: leadCsvs.filename,
        leadCount: leadCsvs.leadCount,
        postUrls: leadCsvs.postUrls,
        createdAt: leadCsvs.createdAt,
      })
      .from(leadCsvs)
      .leftJoin(contacts, eq(leadCsvs.contactId, contacts.id))
      .leftJoin(linkedinProfiles, eq(leadCsvs.profileId, linkedinProfiles.id))
      .where(where)
      .orderBy(desc(leadCsvs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(leadCsvs)
      .where(where),
  ]);

  const total = Number(countResult[0]?.count || 0);

  return NextResponse.json({
    csvs: rows.map((r) => ({
      ...r,
      contactName: r.contactName ?? null,
      profileName: r.profileName ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
