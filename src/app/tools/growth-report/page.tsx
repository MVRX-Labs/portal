"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function GrowthReportPage() {
  const tool = TOOLS.find((t) => t.id === "growth-report")!;
  return <ToolForm tool={tool} />;
}
