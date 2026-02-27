import { Router } from "express";
import { runClaudeJob, log } from "../lib/claude-runner.js";
import { MODEL_MAP, resolveModel } from "../lib/job-utils.js";

const router = Router();

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
- Tone and emotional register
- Opening and closing habits
- Any distinctive quirks or stylistic fingerprints

Step 2 — Use that analysis to guide your rewrite, matching those specific patterns as closely as possible.

<writing_samples>
${writingExamples}
</writing_samples>
`
    : "";

  return `You are an expert LinkedIn ghostwriter who specializes in making AI-generated posts sound authentically human.

ANTI-PATTERN RULES (Critical):
- NEVER use these words or phrases: delve, tapestry, moreover, furthermore, comprehensive, robust, utilize, leverage, nuanced, crucial, significant, transformative, testament, authentic, enhance, ever-evolving, in conclusion, additionally, it's worth noting, game-changer, landscape, paradigm, synergy, holistic, streamline, cutting-edge, innovative, groundbreaking, revolutionize, empower, foster, navigate, pivotal, seamless, dynamic, harness, spearhead, ecosystem
- Do NOT start consecutive sentences with the same word
- Do NOT use bullet points or numbered lists unless the original post has them
- Do NOT use a formulaic intro-body-conclusion structure
- Do NOT add hashtags unless the original post has them
- Do NOT add a call-to-action unless the original has one
- Vary sentence length dramatically — mix short punchy fragments (3-6 words) with longer complex ones (15-25 words). This "burstiness" is the single biggest differentiator between human and AI writing.
- Use occasional incomplete sentences, dashes, or parenthetical asides — the way people actually write

${toneBlock}
${styleAnalysisBlock}
TASK:
Rewrite the following LinkedIn post to sound like a real human wrote it. Preserve the core message and any specific facts/numbers, but completely rework the language, structure, and flow.

Return ONLY the rewritten post — no commentary, no explanations, no labels, no quotation marks wrapping the output.

<original_post>
${postContent}
</original_post>`;
}

interface LinkedInHumanizerRequest {
  runId: string;
  postContent: string;
  tone: string;
  writingExamples?: string;
  model?: string;
  callbackUrl: string;
}

router.post("/linkedin-humanizer", (req, res) => {
  const { runId, postContent, tone, writingExamples, model, callbackUrl } = req.body as LinkedInHumanizerRequest;

  if (!runId || !postContent || !callbackUrl) {
    res.status(400).json({ error: "runId, postContent, and callbackUrl are required" });
    return;
  }

  log(
    runId,
    `Received linkedin-humanizer job (tone: ${tone || "default"}, writing examples: ${writingExamples ? "yes" : "no"})`,
  );
  res.status(202).json({ status: "accepted" });

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: resolveModel(model, MODEL_MAP.haiku),
    maxTurns: 3,
    allowedTools: [],
    prompt: buildHumanizerPrompt(postContent, tone || "professional", writingExamples),
  });
});

export default router;
