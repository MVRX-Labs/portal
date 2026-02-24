"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function OutboundSequencePage() {
  const tool = TOOLS.find((t) => t.id === "outbound-sequence")!;
  return <ToolForm tool={tool} />;
}
