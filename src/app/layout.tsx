"use client";

import "./globals.css";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

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
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-6 overflow-auto">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
