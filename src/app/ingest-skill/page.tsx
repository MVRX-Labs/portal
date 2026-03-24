"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function IngestSkillPage() {
  const tool = TOOLS.find((t) => t.id === "ingest-skill")!;
  return <ToolForm tool={tool} />;
}
