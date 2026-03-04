"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AccountSelector } from "./account-selector";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  dev?: boolean;
  beta?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/accounts", label: "Accounts", icon: "🏢" },
  { href: "/tools/linkedin-audit", label: "LinkedIn Audit", icon: "👤" },
  { href: "/tools/linkedin-post-generator", label: "LinkedIn Post Generator", icon: "📝" },
  { href: "/tools/outbound-sequence", label: "LinkedIn Outbound Sequence", icon: "📨", dev: true },
  { href: "/tools/linkedin-humanizer", label: "Post Humanizer", icon: "✍", beta: true },
  { href: "/tools/gtm-strategy", label: "GTM Strategy", icon: "🎯", beta: true },
  { href: "/tools/sentiment-analysis", label: "Sentiment Analysis", icon: "📊", beta: true },
  { href: "/leads", label: "Leads", icon: "👥", beta: true },
  { href: "/history", label: "Run History", icon: "📋" },
  { href: "/resources", label: "Resources", icon: "📁" },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const user = session?.user;
  const accountParam = searchParams.get("account");
  const qs = accountParam ? `?account=${accountParam}` : "";

  return (
    <aside className="flex flex-col w-56 min-h-screen border-r border-[var(--border)] bg-black">
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold tracking-tight">MVRX Labs</h1>
        <p className="text-xs text-[var(--muted)]">Internal Portal</p>
      </div>

      <AccountSelector />

      <nav className="flex-1 py-2">
        {navItems
          .filter((item) => !item.adminOnly || user?.isAdmin)
          .map((item) =>
            item.dev ? (
              <span
                key={item.href}
                className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--muted)] opacity-50 cursor-not-allowed select-none"
                title="Under development"
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none whitespace-nowrap">
                  DEV
                </span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={`${item.href}${qs}`}
                className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                  pathname.startsWith(item.href)
                    ? "bg-[var(--input)] text-white"
                    : "text-[var(--muted)] hover:text-white hover:bg-[var(--input)]"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.beta && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none whitespace-nowrap">
                    BETA
                  </span>
                )}
              </Link>
            )
          )}

        {user?.isAdmin && (
          <>
            <Link
              href={`/admin/calendar${qs}`}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                pathname.startsWith("/admin/calendar")
                  ? "bg-[var(--input)] text-white"
                  : "text-[var(--muted)] hover:text-white hover:bg-[var(--input)]"
              }`}
            >
              <span className="text-base">📅</span>
              Calendar Sync
            </Link>
            <Link
              href={`/admin/users${qs}`}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                pathname.startsWith("/admin/users")
                  ? "bg-[var(--input)] text-white"
                  : "text-[var(--muted)] hover:text-white hover:bg-[var(--input)]"
              }`}
            >
              <span className="text-base">⚙</span>
              User Management
            </Link>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-[var(--border)]">
        {user && (
          <div className="mb-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-[var(--muted)] truncate">{user.email}</p>
          </div>
        )}
        <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-secondary w-full text-xs">
          Sign Out
        </button>
      </div>
    </aside>
  );
}
