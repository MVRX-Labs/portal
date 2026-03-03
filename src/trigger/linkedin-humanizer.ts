import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";

const TONE_GUIDANCE: Record<string, string> = {
  professional: `Tone: Professional. Use polished but natural language. Avoid jargon for jargon's sake.
Sound like a senior executive writing candidly — confident, measured, but not stiff.`,
  casual: `Tone: Casual. Write like you're talking to a smart friend over coffee.
Use contractions, conversational asides, and relaxed punctuation. It's okay to start sentences with "And" or "But."`,
  "thought-leader": `Tone: Thought Leader. Write with conviction and original perspective.
Take a clear stance. Use rhetorical questions sparingly. Sound like someone who's done the work, not someone summarizing others' ideas.`,
  storytelling: `Tone: Storytelling. Lead with a specific moment, scene, or anecdote.
Use sensory details and dialogue where appropriate. Build tension before the insight. Make the reader feel something before they learn something.`,
};

function buildHumanizerPrompt(postContent: string, tone: string, writingExamples?: string): string {
  const toneBlock = TONE_GUIDANCE[tone] || TONE_GUIDANCE["professional"];

  const styleAnalysisBlock = writingExamples
    ? `
WRITING STYLE ANALYSIS (Two-Step Process):
You have been provided with examples of the author's actual writing. Before rewriting, complete these two steps:

Step 1 — Analyze the writing samples and identify:
- Sentence structure patterns and average length
- Vocabulary preferences and signature phrases
- Contraction habits and formality level
- Tone and emotional register
- Opening and closing habits
- Emoji usage patterns (or lack thereof)
- Any distinctive quirks (e.g., rhetorical questions, sentence fragments, parenthetical asides)

Step 2 — Use that analysis to guide your rewrite, matching those specific patterns as closely as possible.

<writing_samples>
${writingExamples}
</writing_samples>
`
    : "";

  return `You are an expert LinkedIn ghostwriter who specializes in making AI-generated posts sound authentically human. You write for a platform where readers are actively looking for AI tells — em dashes, buzzwords, formulaic hooks — and judging accordingly.

ANTI-PATTERN RULES — VOCABULARY:
- NEVER use these words or phrases: delve, tapestry, moreover, furthermore, comprehensive, robust, utilize, leverage, nuanced, crucial, significant, transformative, testament, authentic, enhance, ever-evolving, in conclusion, additionally, it's worth noting, game-changer, landscape, navigate, realm, embark, foster, facilitate, streamline, underscore, commendable, meticulous, adept
- Do NOT start consecutive sentences with the same word

ANTI-PATTERN RULES — PUNCTUATION AND FORMATTING:
- AVOID em dashes (—). Use commas, periods, colons, or parentheses instead. Em dashes are the single most discussed AI writing tell on LinkedIn and social media. If an em dash is absolutely necessary, use at most one in the entire post.
- Do NOT use bullet points or numbered lists unless the original post has them
- Do NOT use a formulaic intro-body-conclusion structure
- Do NOT open with emoji-title-emoji patterns (e.g., 🚀 Big News! 🚀)
- Do NOT scatter emojis after every sentence or paragraph. If emojis are used, limit to 1-2 total, placed where they feel earned, not decorative. Avoid the "AI emoji trinity": 🚀, ✨, ⭐

ANTI-PATTERN RULES — LANGUAGE NATURALNESS:
- USE contractions naturally throughout (it's, don't, can't, I've, we're, you'll). Fully expanded forms like "it is," "do not," "cannot" read as stiff and robotic. Default to contractions unless the tone calls for unusual formality.
- Vary sentence length dramatically — mix short punchy fragments with longer complex ones. This "burstiness" is the single biggest differentiator between human and AI writing.
- Write at roughly a 6th-8th grade reading level. Short words beat long words. "Use" beats "utilize." "Help" beats "facilitate." LinkedIn's algorithm penalizes posts above a 10th-grade reading level with 35%+ less reach.

PERSONAL VOICE INJECTION:
- Where the original post makes a generic claim ("This is important for leaders"), rewrite with first-person stance or subjective framing ("I've watched this trip up even experienced leaders" / "Here's what I think most people miss")
- Include at least one moment of opinion, hedging, or personal observation that an AI would not generate on its own
- Prefer "I" and "you" over "one" and "individuals"
- It's fine to sound slightly uncertain or imperfect — humans hedge, trail off, and change direction mid-thought

LINKEDIN-SPECIFIC FORMATTING:
- The first 2-3 lines are everything — LinkedIn truncates after ~3 lines on mobile. Open with a hook that makes people click "see more": a bold opinion, a surprising fact, a half-finished story, or a direct question. Do NOT open with "I'm thrilled to announce" or "In today's fast-paced world" or similar generic openers.
- Keep paragraphs to 1-3 sentences max. White space is your friend on LinkedIn's mobile feed.
- End with something that invites a response (a question, a challenge, a vulnerable admission) rather than a neat summary or call-to-action that reads as a template.
- If the original post has a clear CTA, keep it but make it feel conversational rather than formulaic.

STRUCTURAL PATTERN BREAKING:
- Do NOT follow a predictable structure. Instead, try: starting mid-thought or with a story already in progress, opening with the conclusion and then explaining why, using a single strong opinion as the spine of the entire post, or ending abruptly or with a callback to the opening line.
- Humans pick a side. AI hedges everything. If the original post says "there are pros and cons," rewrite it with a clear point of view.

${toneBlock}
${styleAnalysisBlock}
TASK:
Rewrite the following LinkedIn post to sound like a real human wrote it. Preserve the core message and any specific facts/numbers, but completely rework the language, structure, and flow.

Return ONLY the rewritten post — no commentary, no explanations, no labels, no quotation marks wrapping the output.

<original_post>
${postContent}
</original_post>`;
}

interface LinkedInHumanizerPayload {
  runId: string;
  postContent: string;
  tone: string;
  writingExamples?: string;
  model?: string;
}

export const linkedinHumanizerTask = task({
  id: "linkedin-humanizer",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: LinkedInHumanizerPayload, { signal }) => {
    const { runId, postContent, tone, writingExamples, model } = payload;

    try {
      metadata.set("progress", { step: "Rewriting post", stepNumber: 1, totalSteps: 2, percentage: 10 });

      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);
      logger.info("Starting LinkedIn humanizer", { runId, tone, model: resolvedModel });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";

      for await (const message of query({
        prompt: buildHumanizerPrompt(postContent, tone || "professional", writingExamples),
        options: {
          model: resolvedModel,
          abortController,
          allowedTools: [],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 3,
          persistSession: false,
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("text" in block && block.text) {
              const preview = block.text.length > 150 ? block.text.slice(0, 150) + "..." : block.text;
              logger.info(`Claude: ${preview}`);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            logger.info(`Claude finished: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`);
          } else {
            const msg = message as any;
            const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
            throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
          }
        }
      }

      metadata.set("progress", { step: "Complete", stepNumber: 2, totalSteps: 2, percentage: 100 });

      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("Humanizer completed", { runId, outputLength: output.length });

      return { success: true, output };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Humanizer failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "linkedin-humanizer",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
