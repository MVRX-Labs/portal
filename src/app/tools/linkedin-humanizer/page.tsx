"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function LinkedInHumanizerPage() {
  const tool = TOOLS.find((t) => t.id === "linkedin-humanizer")!;
  return <ToolForm tool={tool} />;
}
