import { auth } from "@/lib/auth-config";
import { NextResponse } from "next/server";

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (pathname === "/" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Slack webhooks use their own signature verification — skip session/API key auth
  if (pathname === "/api/knowledge/slack-events") {
    return NextResponse.next();
  }

  // API key auth for agents — bypasses session auth on API routes
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && pathname.startsWith("/api/")) {
    const expectedKey = process.env.AGENT_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    const agentUserId = process.env.AGENT_USER_ID;
    if (!agentUserId) {
      return NextResponse.json({ error: "AGENT_USER_ID not configured" }, { status: 500 });
    }
    const headers = new Headers(request.headers);
    headers.set("x-user-id", agentUserId);
    headers.set("x-user-name", process.env.AGENT_USER_NAME || "Agent");
    headers.set("x-user-email", process.env.AGENT_USER_EMAIL || "agent@mvrxlabs.com");
    return NextResponse.next({ request: { headers } });
  }

  const session = request.auth;
  if (!session?.user?.id) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch";
  if (isPrefetch) {
    const prefetchHeaders = new Headers(request.headers);
    prefetchHeaders.delete("x-user-id");
    return NextResponse.next({ request: { headers: prefetchHeaders } });
  }

  const headers = new Headers(request.headers);
  headers.set("x-user-id", session.user.id);
  headers.set("x-user-name", session.user.name || "");
  headers.set("x-user-email", session.user.email || "");

  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tools/:path*",
    "/history/:path*",
    "/org/:path*",
    "/resources/:path*",
    "/api/tools/:path*",
    "/api/history/:path*",
    "/api/org/:path*",
    "/api/resources/:path*",
    "/api/runs/:path*",
    "/api/accounts/:path*",
    "/api/contacts/:path*",
    "/linkedin-engagement/:path*",
    "/twitter-engagement/:path*",
    "/leads/:path*",
    "/linkedin-leads/:path*",
    "/twitter-leads/:path*",
    "/analytics/:path*",
    "/alpha-feed/:path*",
    "/twitter-alpha-feed/:path*",
    "/twitter-analytics/:path*",
    "/api/knowledge/:path*",
  ],
};
