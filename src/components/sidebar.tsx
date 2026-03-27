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
  dev?: boolean;
  beta?: boolean;
}

interface NavSection {
  label: string;
  icon: string;
  collapsible: true;
  items: NavItem[];
}

const generalItems: NavItem[] = [
  { href: "/accounts/__SLUG__", label: "Overview", icon: "📋", beta: true },
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/leads", label: "All Leads", icon: "👥" },
];

const linkedinItems: NavItem[] = [
  { href: "/tools/linkedin-audit", label: "Profile Audit", icon: "👤" },
  { href: "/tools/linkedin-post-generator", label: "Post Generator", icon: "📝" },
  { href: "/tools/linkedin-to-twitter", label: "Post to Tweets", icon: "🐦" },
  { href: "/linkedin-engagement", label: "Engagement Bot", icon: "🤖" },
  { href: "/analytics", label: "Post Analytics", icon: "📈" },
  { href: "/alpha-feed", label: "Alpha Feed", icon: "🔥" },
  { href: "/linkedin-leads", label: "Leads from Engagement", icon: "👥" },
  { href: "/tools/outbound-sequence", label: "Outbound Sequence", icon: "📨", beta: true },
];

const twitterItems: NavItem[] = [
  { href: "/tools/twitter-audit", label: "Profile Audit", icon: "👤" },
  { href: "/tools/twitter-post-generator", label: "Post Generator", icon: "📝" },
  { href: "/tools/twitter-to-linkedin", label: "Thread to LinkedIn", icon: "🔄" },
  { href: "/twitter-engagement", label: "Engagement Bot", icon: "🤖" },
  { href: "/twitter-analytics", label: "Post Analytics", icon: "📈" },
  { href: "/twitter-alpha-feed", label: "Alpha Feed", icon: "🔥" },
  { href: "/twitter-leads", label: "Leads from Engagement", icon: "👥" },
];

const otherToolItems: NavItem[] = [
  { href: "/tools/growth-report", label: "SEO & Growth Report", icon: "📊" },
  { href: "/tools/geo-audit", label: "GEO Audit", icon: "🤖", beta: true },
  { href: "/tools/gtm-strategy", label: "GTM Strategy", icon: "🎯" },
  { href: "/org/knowledge", label: "Knowledge Hub", icon: "🧠" },
];

const orgItems: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: "🏢" },
  { href: "/history", label: "Run History", icon: "📋" },
  { href: "/resources", label: "Resources", icon: "📁" },
  { href: "/ingest-skill", label: "Ingest Skill", icon: "🧩" },
  { href: "/org/calendar", label: "Calendar Sync", icon: "📅" },
  { href: "/org/users", label: "User Management", icon: "⚙" },
  { href: "/org/secrets", label: "Secrets", icon: "🔑" },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { account } = useAccount();
  const [highlightSelector, setHighlightSelector] = useState(0);
  const [linkedinOpen, setLinkedinOpen] = useState(true);
  const [twitterOpen, setTwitterOpen] = useState(true);

  const user = session?.user;
  const accountParam = searchParams.get("account") || account?.id || null;
  const qs = accountParam ? `?account=${accountParam}` : "";

  const handleDisabledClick = () => {
    setHighlightSelector((c) => c + 1);
  };

  const resolveHref = (item: NavItem) => {
    if (item.href.includes("__SLUG__") && account) {
      return item.href.replace("__SLUG__", account.slug);
    }
    return item.href;
  };

  const isActive = (item: NavItem) => {
    if (item.href.includes("__SLUG__")) {
      return /^\/accounts\/[^/]+/.test(pathname);
    }
    if (item.href === "/accounts") {
      return pathname === "/accounts";
    }
    return pathname.startsWith(item.href);
  };

  const sectionHasActive = (items: NavItem[]) => items.some((item) => isActive(item));

  const renderNavItem = (item: NavItem, disabled: boolean) => {
    if (item.dev || disabled) {
      return (
        <span
          key={item.href}
          onClick={disabled && !item.dev ? handleDisabledClick : undefined}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm text-(--muted) opacity-50 select-none ${
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

    const href = resolveHref(item);
    const needsQs = !item.href.includes("__SLUG__");
    const separator = href.includes("?") ? "&" : "?";
    const fullQs = accountParam ? `${separator}account=${accountParam}` : "";

    return (
      <Link
        key={item.href}
        href={`${href}${needsQs ? fullQs : ""}`}
        className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
          isActive(item) ? "bg-(--input) text-white" : "text-(--muted) hover:text-white hover:bg-(--input)"
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

  const renderCollapsibleSection = (
    label: string,
    icon: string,
    items: NavItem[],
    isOpen: boolean,
    toggle: () => void,
    disabled: boolean,
    sectionBeta?: boolean
  ) => {
    const hasActive = sectionHasActive(items);

    return (
      <div>
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm w-full text-left transition-colors ${
            hasActive ? "text-white" : "text-(--muted) hover:text-white"
          }`}
        >
          <span className="text-base">{icon}</span>
          <span className="flex-1 font-medium">{label}</span>
          {sectionBeta && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium leading-none whitespace-nowrap shrink-0">
              BETA
            </span>
          )}
          <span className="text-[10px] text-(--muted) shrink-0">{isOpen ? "\u25B2" : "\u25BC"}</span>
        </button>
        {isOpen && <div className="pl-3">{items.map((item) => renderNavItem(item, disabled))}</div>}
      </div>
    );
  };

  return (
    <aside className="flex flex-col w-56 min-h-screen border-r border-(--border) bg-black">
      <Link href="/dashboard" className="block p-4 border-b border-(--border) hover:bg-(--input) transition-colors">
        <h1 className="text-lg font-bold tracking-tight">MVRX Labs</h1>
        <p className="text-xs text-(--muted)">Internal Portal</p>
      </Link>

      <AccountSelector highlight={highlightSelector > 0 ? true : undefined} key={highlightSelector} />

      <nav className="flex-1 py-2 flex flex-col">
        <div>
          <div className="px-4 pt-1 pb-2">
            <span className="text-[10px] uppercase tracking-wider text-(--muted)">
              {account ? account.name : "No account selected"}
            </span>
          </div>
          {generalItems.map((item) => renderNavItem(item, !account))}

          {renderCollapsibleSection(
            "LinkedIn",
            "💼",
            linkedinItems,
            linkedinOpen,
            () => setLinkedinOpen(!linkedinOpen),
            !account
          )}
          {renderCollapsibleSection(
            "Twitter / X",
            "𝕏",
            twitterItems,
            twitterOpen,
            () => setTwitterOpen(!twitterOpen),
            !account,
            true
          )}

          {otherToolItems.map((item) => renderNavItem(item, !account))}
        </div>

        <div className="border-t border-(--border) mt-2 pt-2">
          <div className="px-4 pt-1 pb-2">
            <span className="text-[10px] uppercase tracking-wider text-(--muted)">Organization</span>
          </div>
          {orgItems.map((item) => renderNavItem(item, false))}
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
