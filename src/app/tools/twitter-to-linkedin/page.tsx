"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function TwitterToLinkedInPage() {
  const tool = TOOLS.find((t) => t.id === "twitter-to-linkedin")!;
  return <ToolForm tool={tool} />;
}
