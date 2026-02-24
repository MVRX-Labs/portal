"use client";

import { ToolForm } from "@/components/tool-form";
import { TOOLS } from "@/lib/types";

export default function SentimentAnalysisPage() {
  const tool = TOOLS.find((t) => t.id === "sentiment-analysis")!;
  return <ToolForm tool={tool} />;
}
