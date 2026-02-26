import { Router } from "express";
import { writeFile, readdir, readFile } from "fs/promises";
import { join } from "path";
import { runClaudeJob, log } from "../lib/claude-runner.js";
import { buildAuditDocx } from "../lib/audit-docx-builder.js";
import type { LinkedInAuditContent } from "../lib/audit-schema.js";

const router = Router();

const OUTPUT_DIR = "/Users/danny/Google Drive/Shared drives/Shared Drive - MVRX/Generated materials";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const OPUS_MODEL = "claude-opus-4-6";

// ─── LinkedIn Audit ─────────────────────────────────────────────────────────

function currentMonth(): string {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1];
  const bare = raw.match(/\{[\s\S]*\}/);
  if (bare) return bare[0];
  throw new Error("No JSON object found in Claude output");
}

async function extractJSONFromSessionDir(dir: string): Promise<string> {
  const files = await readdir(dir);
  const candidates = files.filter(
    (f) => f.endsWith(".json") && !f.startsWith("scraped-")
  );

  for (const file of candidates) {
    const content = await readFile(join(dir, file), "utf-8");
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && "personName" in parsed) {
        return content;
      }
    } catch {}
  }

  throw new Error(
    "No JSON object found in Claude output or session directory files"
  );
}

const AUDIT_PROMPT = (slug: string, date: string) => `\
You are creating a comprehensive LinkedIn profile audit for https://www.linkedin.com/in/${slug}.

Read the scraped profile data from scraped-profile.json and the posts data from scraped-posts.json.
Analyse the profile thoroughly and produce a detailed, opinionated audit.
Be specific and direct — reference actual data from the profile and posts. Give honest scores.

Output your analysis as a **single JSON object** matching this TypeScript schema:

interface LinkedInAuditContent {
  personName: string;            // full name
  personTitle: string;           // current role + company
  linkedinSlug: string;          // "${slug}"
  preparedDate: string;          // "${date}"
  executiveSummary: string[];    // 2-4 substantive paragraphs
  overallScore: number;          // 0-100 weighted total
  verdict: string;               // one-paragraph italic verdict
  scorecard: Array<{
    category: string;            // e.g. "Headline"
    score: number;               // 0-10
    assessment: string;          // one-sentence assessment
  }>;
  sections: Array<{
    title: string;
    subsections?: Array<{
      title: string;
      content: ContentBlock[];
    }>;
    content?: ContentBlock[];    // for sections without subsections
  }>;
}

type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "labeled"; label: string; text: string }      // bold label prefix
  | { type: "bulletList"; items: Array<{ label?: string; text: string }> }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }

SCORECARD CATEGORIES (always include all 10):
Headline, About Section, Experience, Profile Photo, Banner Image, Featured Section, Skills, Posting Cadence, Content Quality, Engagement Rate

SECTIONS TO INCLUDE (in this order):
1. "Profile Optimisation Audit" — subsections: Headline, About Section, Experience Section, Banner Image, Featured Section & Skills, Education
2. "Content Strategy Audit" — subsections: Posting Frequency (include a data table of post history), Content Performance (include a table of posts with engagement metrics), plus any other relevant content analysis subsections
3. "Competitive Positioning" — no subsections; use content blocks directly
4. "Strategic Recommendations" — subsections: Quick Wins (This Week), Medium-Term (Next 30 Days), Long-Term (90-Day Vision). Use "numberedList" blocks for the items in each.
5. "2-Week Content Calendar" — no subsections; include a brief intro paragraph, then a "table" block with columns Day, Topic, Format, Hook (4 entries), then an outro paragraph about content themes.

CONTENT GUIDELINES:
- For profile subsections: state the current situation, give your assessment, then provide a specific recommendation using a "labeled" block (label: "Recommendation:").
- Use "bulletList" when listing multiple items with analysis (e.g. experience roles).
- Use "table" blocks for data that benefits from tabular display.
- Be actionable: give exact wording suggestions for headlines, about sections, etc.
- Reference real numbers from the scraped data (follower counts, engagement stats, post counts).

CRITICAL: Your final text response MUST contain the raw JSON object directly — not in a file, not as a summary.
Do NOT use the Write tool to save the JSON to a file. Do NOT summarise the results.
Just output the raw JSON object as your final message. No markdown formatting, no code fences, no text before or after — only the JSON.`;

interface LinkedInAuditRequest {
  runId: string;
  slug: string;
  profileData: unknown;
  postsData: unknown;
  callbackUrl: string;
}

router.post("/linkedin-audit", (req, res) => {
  const { runId, slug, profileData, postsData, callbackUrl } = req.body as LinkedInAuditRequest;

  if (!runId || !slug || !callbackUrl) {
    res.status(400).json({ error: "runId, slug, and callbackUrl are required" });
    return;
  }

  log(runId, `Received linkedin-audit job for slug "${slug}"`);
  res.status(202).json({ status: "accepted" });

  const preparedDate = currentMonth();

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: OPUS_MODEL,
    maxTurns: 15,
    allowedTools: ["Read"],
    prompt: AUDIT_PROMPT(slug, preparedDate),

    setupSession: async (dir) => {
      await writeFile(join(dir, "scraped-profile.json"), JSON.stringify(profileData, null, 2), "utf-8");
      await writeFile(join(dir, "scraped-posts.json"), JSON.stringify(postsData, null, 2), "utf-8");
    },

    postProcess: async (output, sessionDir) => {
      let json: string;
      try {
        json = extractJSON(output);
      } catch {
        log(runId, "JSON not found in text output, scanning session directory…");
        json = await extractJSONFromSessionDir(sessionDir);
      }
      const content: LinkedInAuditContent = JSON.parse(json);

      const buf = await buildAuditDocx(content);

      const filename = `MVRX | ${content.personName} | LinkedIn Audit.docx`;
      const filepath = join(OUTPUT_DIR, filename);
      await writeFile(filepath, buf);

      log(runId, `DOCX written → ${filepath} (${(buf.length / 1024).toFixed(0)} KB)`);
      return `Audit document saved: ${filename}`;
    },
  });
});

// ─── LinkedIn Post Humanizer ─────────────────────────────────────────────────

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
  callbackUrl: string;
}

router.post("/linkedin-humanizer", (req, res) => {
  const { runId, postContent, tone, writingExamples, callbackUrl } =
    req.body as LinkedInHumanizerRequest;

  if (!runId || !postContent || !callbackUrl) {
    res
      .status(400)
      .json({ error: "runId, postContent, and callbackUrl are required" });
    return;
  }

  log(runId, `Received linkedin-humanizer job (tone: ${tone || "default"}, writing examples: ${writingExamples ? "yes" : "no"})`);
  res.status(202).json({ status: "accepted" });

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: HAIKU_MODEL,
    maxTurns: 3,
    allowedTools: [],
    prompt: buildHumanizerPrompt(postContent, tone || "professional", writingExamples),
  });
});

// ─── System Test ────────────────────────────────────────────────────────────

interface TestJobRequest {
  runId: string;
  callbackUrl: string;
}

router.post("/test", (req, res) => {
  const { runId, callbackUrl } = req.body as TestJobRequest;

  if (!runId || !callbackUrl) {
    res.status(400).json({ error: "runId and callbackUrl are required" });
    return;
  }

  log(runId, "Received test job");
  res.status(202).json({ status: "accepted" });

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: HAIKU_MODEL,
    maxTurns: 2,
    allowedTools: [],
    prompt: "Write a short haiku about software testing. Return only the haiku, nothing else.",
  });
});

export default router;
