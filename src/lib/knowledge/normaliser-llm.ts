/**
 * Knowledge Hub — LLM call wrapper for normalisation.
 */

import Anthropic from "@anthropic-ai/sdk";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

const anthropic = new Anthropic();

// Sonnet 4.6 pricing as of 2026-03 — update if model changes
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export async function callLLM(prompt: string, logger: Logger): Promise<{ output: string; cost: number }> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cost =
    response.usage.input_tokens * INPUT_COST_PER_TOKEN + response.usage.output_tokens * OUTPUT_COST_PER_TOKEN;

  logger.info(
    `LLM completed: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out, $${cost.toFixed(4)}`
  );
  return { output: text, cost };
}
