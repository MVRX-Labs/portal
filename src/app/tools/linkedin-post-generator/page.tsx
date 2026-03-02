"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function LinkedInPostGeneratorPage() {
  const tool = TOOLS.find((t) => t.id === "linkedin-post-generator")!;
  return <ToolForm tool={tool} />;
}
