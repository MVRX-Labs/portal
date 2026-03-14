"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function LinkedInToTwitterPage() {
  const tool = TOOLS.find((t) => t.id === "linkedin-to-twitter")!;
  return <ToolForm tool={tool} />;
}
