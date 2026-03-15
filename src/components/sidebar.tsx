"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AccountSelector } from "./account-selector";
import { useAccount } from "./account-provider";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  dev?: boolean;
  beta?: boolean;
}

const accountItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/tools/linkedin-audit", label: "LinkedIn Audit", icon: "👤" },
  { href: "/tools/linkedin-post-generator", label: "LinkedIn Post Generator", icon: "📝" },
  { href: "/tools/linkedin-to-twitter", label: "LinkedIn Post to Tweets", icon: "🐦", beta: true },
  { href: "/leads", label: "LinkedIn Leads from Engagement", icon: "👥" },
  { href: "/tools/outbound-sequence", label: "LinkedIn Outbound Sequences", icon: "📨", beta: true },
  { href: "/tools/growth-report", label: "SEO & Growth Report", icon: "📊", beta: true },
  { href: "/tools/gtm-strategy", label: "GTM Strategy", icon: "🎯", beta: true },
  { href: "/tools/seo-audit", label: "SEO Audit", icon: "🔍", beta: true, dev: true },
  // { href: "/tools/linkedin-humanizer", label: "Post Humanizer", icon: "✍", beta: true }, NOT NEEDED?
  { href: "/tools/sentiment-analysis", label: "Sentiment Analysis", icon: "📊", beta: true, dev: true },
  { href: "/linkedin-engagement", label: "LinkedIn Engagement Bot", icon: "🤖" },
  { href: "/analytics", label: "LinkedIn Post Analytics", icon: "📈" },
];

const orgItems: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: "🏢" },
  { href: "/history", label: "Run History", icon: "📋" },
  { href: "/resources", label: "Resources", icon: "📁" },
];

const adminItems: NavItem[] = [
  { href: "/admin/calendar", label: "Calendar Sync", icon: "📅" },
  { href: "/admin/users", label: "User Management", icon: "⚙" },
  { href: "/admin/knowledge", label: "Knowledge Hub", icon: "🧠" },
  { href: "/admin/secrets", label: "Secrets", icon: "🔑" },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { account } = useAccount();
  const [highlightSelector, setHighlightSelector] = useState(0);

  const user = session?.user;
  const accountParam = searchParams.get("account");
  const qs = accountParam ? `?account=${accountParam}` : "";

  const handleDisabledClick = () => {
    setHighlightSelector((c) => c + 1);
  };

  const renderNavItem = (item: NavItem, disabled: boolean) => {
    if (item.dev || disabled) {
      return (
        <span
          key={item.href}
          onClick={disabled && !item.dev ? handleDisabledClick : undefined}
          className={`flex items-center gap-2 px-4 py-2 text-sm text-(--muted) opacity-50 select-none ${
            disabled && !item.dev ? "cursor-pointer" : "cursor-not-allowed"
          }`}
          title={item.dev ? "Under development" : "Select an account first"}
        >
          <span className="text-base">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          {item.dev && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium leading-none whitespace-nowrap">
              DEV
            </span>
          )}
          {item.beta && !item.dev && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none whitespace-nowrap opacity-50">
              BETA
            </span>
          )}
        </span>
      );
    }

    return (
      <Link
        key={item.href}
        href={`${item.href}${qs}`}
        className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
          pathname.startsWith(item.href)
            ? "bg-(--input) text-white"
            : "text-(--muted) hover:text-white hover:bg-(--input)"
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
    );
  };

  return (
    <aside className="flex flex-col w-56 min-h-screen border-r border-(--border) bg-black">
      <div className="p-4 border-b border-(--border)">
        <h1 className="text-lg font-bold tracking-tight">MVRX Labs</h1>
        <p className="text-xs text-(--muted)">Internal Portal</p>
      </div>

      <AccountSelector highlight={highlightSelector > 0 ? true : undefined} key={highlightSelector} />

      <nav className="flex-1 py-2 flex flex-col">
        <div>
          <div className="px-4 pt-1 pb-2">
            <span className="text-[10px] uppercase tracking-wider text-(--muted)">
              {account ? account.name : "No account selected"}
            </span>
          </div>
          {accountItems.map((item) => renderNavItem(item, !account))}
        </div>

        <div className="border-t border-(--border) mt-2 pt-2">
          <div className="px-4 pt-1 pb-2">
            <span className="text-[10px] uppercase tracking-wider text-(--muted)">Organization</span>
          </div>
          {orgItems.map((item) => renderNavItem(item, false))}
          {user?.isAdmin && adminItems.map((item) => renderNavItem(item, false))}
        </div>
      </nav>

      <div className="p-4 border-t border-(--border)">
        {user && (
          <div className="mb-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-(--muted) truncate">{user.email}</p>
          </div>
        )}
        <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-secondary w-full text-xs">
          Sign Out
        </button>
      </div>
    </aside>
  );
}
