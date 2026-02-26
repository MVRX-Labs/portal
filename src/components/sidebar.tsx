"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserInfo {
  name: string;
  email: string;
  isAdmin: boolean;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/tools/system-test", label: "System Test", icon: "🧪" },
  { href: "/tools/linkedin-audit", label: "LinkedIn Audit", icon: "👤" },
  { href: "/tools/linkedin-humanizer", label: "Post Humanizer", icon: "✍", dev: true },
  { href: "/tools/gtm-strategy", label: "GTM Strategy", icon: "🎯", dev: true },
  { href: "/tools/sentiment-analysis", label: "Sentiment Analysis", icon: "📊", dev: true },
  { href: "/tools/outbound-sequence", label: "Outbound Sequence", icon: "📨", dev: true },
  { href: "/history", label: "Run History", icon: "📋" },
  { href: "/resources", label: "Resources", icon: "📁" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mvrx-user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    localStorage.removeItem("mvrx-user");
    router.push("/");
  };

  return (
    <aside className="flex flex-col w-56 min-h-screen border-r border-[var(--border)] bg-black">
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold tracking-tight">MVRX Labs</h1>
        <p className="text-xs text-[var(--muted)]">Internal Portal</p>
      </div>

      <nav className="flex-1 py-2">
        {navItems.map((item) =>
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
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                pathname.startsWith(item.href)
                  ? "bg-[var(--input)] text-white"
                  : "text-[var(--muted)] hover:text-white hover:bg-[var(--input)]"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ),
        )}

        {user?.isAdmin && (
          <Link
            href="/admin/users"
            className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
              pathname.startsWith("/admin")
                ? "bg-[var(--input)] text-white"
                : "text-[var(--muted)] hover:text-white hover:bg-[var(--input)]"
            }`}
          >
            <span className="text-base">⚙</span>
            User Management
          </Link>
        )}
      </nav>

      <div className="p-4 border-t border-[var(--border)]">
        {user && (
          <div className="mb-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-[var(--muted)] truncate">{user.email}</p>
          </div>
        )}
        <button onClick={handleLogout} className="btn-secondary w-full text-xs">
          Sign Out
        </button>
      </div>
    </aside>
  );
}
