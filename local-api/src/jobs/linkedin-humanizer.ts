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
