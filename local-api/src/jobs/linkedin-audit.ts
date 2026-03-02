import { Router } from "express";
import { writeFile } from "fs/promises";
import { join } from "path";
import { runClaudeJob, log } from "../lib/claude-runner.js";
import { buildAuditDocx } from "../lib/audit-docx-builder.js";
import type { LinkedInAuditContent } from "../lib/audit-schema.js";
import {
  MODEL_MAP,
  resolveModel,
  currentMonth,
  extractJSON,
  extractJSONFromSessionDir,
  resolveOutputDir,
} from "../lib/job-utils.js";

const router = Router();

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
  accountName?: string;
  model?: string;
  callbackUrl: string;
}

router.post("/linkedin-audit", (req, res) => {
  const { runId, slug, profileData, postsData, accountName, model, callbackUrl } = req.body as LinkedInAuditRequest;

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
    model: resolveModel(model, MODEL_MAP.opus),
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

      const outputDir = await resolveOutputDir(accountName);
      const filename = `MVRX | ${content.personName} | LinkedIn Audit.docx`;
      const filepath = join(outputDir, filename);
      await writeFile(filepath, buf);

      log(runId, `DOCX written → ${filepath} (${(buf.length / 1024).toFixed(0)} KB)`);
      return `Audit document saved: ${filename}`;
    },
  });
});

export default router;
