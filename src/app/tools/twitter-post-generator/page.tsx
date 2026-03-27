"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function TwitterPostGeneratorPage() {
  const tool = TOOLS.find((t) => t.id === "twitter-post-generator")!;
  return <ToolForm tool={tool} />;
}
