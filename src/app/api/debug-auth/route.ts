import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  const cookies = request.cookies.getAll().map((c) => ({
    name: c.name,
    valuePreview: c.value.substring(0, 30) + "...",
  }));

  const url = request.url;
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host");

  let tokenResult: unknown = null;
  let tokenError: string | null = null;
  try {
    tokenResult = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    });
  } catch (e: any) {
    tokenError = e.message;
  }

  let sessionResult: unknown = null;
  let sessionError: string | null = null;
  try {
    const session = await auth();
    sessionResult = session;
  } catch (e: any) {
    sessionError = e.message;
  }

  return NextResponse.json({
    cookies,
    url,
    proto,
    host,
    token: tokenResult,
    tokenError,
    session: sessionResult,
    sessionError,
    envCheck: {
      hasAuthSecret: !!process.env.AUTH_SECRET,
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasStorageDbUrl: !!process.env.STORAGE_DATABASE_URL,
    },
  });
}
