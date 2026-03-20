"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function GeoAuditPage() {
  const tool = TOOLS.find((t) => t.id === "geo-audit")!;
  return <ToolForm tool={tool} />;
}
