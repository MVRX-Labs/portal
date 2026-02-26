"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function SystemTestPage() {
  const tool = TOOLS.find((t) => t.id === "system-test")!;
  return <ToolForm tool={tool} />;
}
