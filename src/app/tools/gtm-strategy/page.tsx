"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function GtmStrategyPage() {
  const tool = TOOLS.find((t) => t.id === "gtm-strategy")!;
  return <ToolForm tool={tool} />;
}
