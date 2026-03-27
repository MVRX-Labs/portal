"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function TwitterAuditPage() {
  const tool = TOOLS.find((t) => t.id === "twitter-audit")!;
  return <ToolForm tool={tool} />;
}
