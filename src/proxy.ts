import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  if (isPrefetch) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!token.isAdmin) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  const headers = new Headers(request.headers);
  headers.set("x-user-id", token.userId as string);
  headers.set("x-user-name", (token.name as string) || "");
  headers.set("x-user-email", (token.email as string) || "");
  headers.set("x-user-admin", String(token.isAdmin ?? false));

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tools/:path*",
    "/history/:path*",
    "/admin/:path*",
    "/resources/:path*",
    "/api/tools/:path*",
    "/api/history/:path*",
    "/api/admin/:path*",
    "/api/resources/:path*",
    "/api/runs/:path*",
    "/api/accounts/:path*",
    "/api/contacts/:path*",
  ],
};
