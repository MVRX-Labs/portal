"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function SeoAuditPage() {
  const tool = TOOLS.find((t) => t.id === "seo-audit")!;
  return <ToolForm tool={tool} />;
}
