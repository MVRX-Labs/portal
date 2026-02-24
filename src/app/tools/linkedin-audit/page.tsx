"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function LinkedInAuditPage() {
  const tool = TOOLS.find((t) => t.id === "linkedin-audit")!;
  return <ToolForm tool={tool} />;
}
