"use client";

import "./globals.css";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { AccountProvider } from "@/components/account-provider";
import { AccountWarningBanner } from "@/components/account-warning-banner";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/";

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {isLoginPage ? (
          <main>{children}</main>
        ) : (
          <Suspense>
            <AccountProvider>
              <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 p-6 overflow-auto">
                  <AccountWarningBanner />
                  {children}
                </main>
              </div>
            </AccountProvider>
          </Suspense>
        )}
      </body>
    </html>
  );
}
