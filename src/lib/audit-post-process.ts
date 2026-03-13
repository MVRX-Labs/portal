/**
 * Post-processing step for LinkedIn audit reports.
 * Runs the generated content through Claude to:
 * 1. Remove signs of AI-generated writing
 * 2. Convert paragraph-heavy sections to bullet points
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LinkedInAuditContent } from "@/lib/audit-schema";

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

const anthropic = new Anthropic();

// Sonnet 4.6 pricing
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const POST_PROCESS_PROMPT = `You are a writing editor revising a LinkedIn audit report so it no longer reads like AI-generated text. You will receive a JSON object representing the full report. Return the same JSON structure with the text cleaned up. Do not change scores, table data, person metadata, or the overall structure.

## Task 1: Remove signs of AI writing

Work through every text field and fix the following patterns:

1. **Em dash overuse** — Replace most em dashes (—) with commas, parentheses, colons, or restructured sentences. Keep at most one or two in the entire report.

2. **Rule of three** — AI defaults to triplets (three adjectives, three examples, three bullets). Break this pattern. Use two items, four, or one. If a sentence says something is "innovative, transformative, and groundbreaking," cut it to one precise adjective.

3. **Bolded lead-in bullet pattern** — Do NOT use the "**Bold Term:** explanation" pattern. Write real sentences in bullet points instead.

4. **Excessive bolding** — Remove unnecessary bold formatting from text content.

5. **Superficial -ing clauses** — Delete trailing present-participle phrases that add fake depth, e.g. "Revenue grew 12%, reflecting the company's continued commitment to innovation." If the point matters, make it a proper sentence.

6. **Inflated significance language** — Remove: "a testament to," "a pivotal moment," "continues to redefine the landscape," "underscores the importance of," "a broader movement toward," "plays a crucial role in shaping." Replace with specific claims or delete.

7. **Vague attributions** — Remove "experts argue," "many believe," "it is widely recognized," "critics have noted" unless a source is named.

8. **Negative parallelism** — Remove "not just X, but Y" and "this isn't merely a tool; it's a paradigm shift" constructions. Say what the thing is, plainly.

9. **Excessive transitions** — Cut "Moreover," "Furthermore," "Additionally," "It is worth noting that," "Notably," "In this context." Let sentences connect through meaning.

10. **Synonym cycling** — Stop rotating through synonyms for the same noun or verb. Pick one term and reuse it naturally.

11. **"From X to Y" constructions** — Replace sweeping "from X to Y" phrasing with plain language.

12. **Uniform sentence length** — Vary the rhythm. Mix short sentences with longer ones.

13. **Hollow summarizing** — Delete sentences that just restate what was already said: "Overall, this demonstrates the significant impact of the initiative."

## Task 2: Convert paragraph-heavy sections to bullet points

Audit reports should be scannable. When a section or subsection contains multiple consecutive paragraph blocks making distinct points, convert them to a bulletList block instead. Each bullet should be a direct, complete thought — not a sentence fragment and not a paragraph.

Rules for conversion:
- If a subsection has only paragraph blocks, make the text a bit more concise and make use of bullet points. Keep any tables, numbered lists, or existing bullet lists as they are.
- Executive summary bullets and scorecard commentary are already short — just clean the language, don't restructure.
- Tables should be left completely unchanged.
- Section and subsection titles should be left unchanged.
- The Final Assessment section should remain as paragraphs (it's intentionally prose).

## Output format

Return ONLY the cleaned JSON object. No markdown fences, no commentary, no explanation. The JSON must parse to the exact same TypeScript interface as the input:

interface LinkedInAuditContent {
  personName: string;
  personTitle: string;
  linkedinSlug: string;
  preparedDate: string;
  executiveSummary: string[];
  overallScore: number;
  scorecard: Array<{ category: string; score: number; commentary: string }>;
  sections: Array<{
    title: string;
    subsections?: Array<{ title: string; content: ContentBlock[] }>;
    content?: ContentBlock[];
  }>;
}

type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "labeled"; label: string; text: string }
  | { type: "bulletList"; items: Array<{ label?: string; text: string }> }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }

Preserve all fields exactly. Only modify text strings and convert paragraph blocks to bulletList blocks where appropriate.`;

export async function postProcessAudit(content: LinkedInAuditContent, logger: Logger): Promise<LinkedInAuditContent> {
  const inputJson = JSON.stringify(content);
  logger.info(`Post-processing audit (${inputJson.length} chars input)`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: `${POST_PROCESS_PROMPT}\n\nHere is the report JSON to clean up:\n\n${inputJson}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cost =
    response.usage.input_tokens * INPUT_COST_PER_TOKEN + response.usage.output_tokens * OUTPUT_COST_PER_TOKEN;

  logger.info(
    `Post-processing completed: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out, $${cost.toFixed(4)}`
  );

  // Extract JSON from the response
  let jsonStr = text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    jsonStr = fenced[1];
  } else {
    const bare = text.match(/\{[\s\S]*\}/);
    if (bare) jsonStr = bare[0];
  }

  const cleaned: LinkedInAuditContent = JSON.parse(jsonStr);

  // Sanity check: ensure critical fields survived
  if (!cleaned.personName || !cleaned.sections || !cleaned.scorecard) {
    throw new Error("Post-processing produced invalid content — missing required fields");
  }

  return cleaned;
}
