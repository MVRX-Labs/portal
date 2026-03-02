import { proxyActivities, ApplicationFailure } from "@temporalio/workflow";
import type { ClaudeAgentInput } from "../activities/claude.js";
import type { BuildAndUploadAuditInput } from "../activities/docx.js";
import type { UpdateToolRunInput } from "../activities/db.js";
import type { SlackNotificationInput } from "../activities/slack.js";
import type { ScrapedLinkedInData } from "../activities/apify.js";

const { scrapeLinkedInProfile } = proxyActivities<{
  scrapeLinkedInProfile(linkedinUrl: string): Promise<ScrapedLinkedInData>;
}>({
  startToCloseTimeout: "3 minutes",
  retry: { maximumAttempts: 2 },
});

const { runClaudeAgent } = proxyActivities<{
  runClaudeAgent(input: ClaudeAgentInput): Promise<string>;
}>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 2 },
});

const { buildAndUploadAuditDocx } = proxyActivities<{
  buildAndUploadAuditDocx(input: BuildAndUploadAuditInput): Promise<{ fileId: string; webViewLink: string }>;
}>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
});

const { updateToolRun } = proxyActivities<{
  updateToolRun(input: UpdateToolRunInput): Promise<void>;
}>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

const { notifySlackFailure } = proxyActivities<{
  notifySlackFailure(input: SlackNotificationInput): Promise<void>;
}>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 2 },
});

export interface LinkedInAuditInput {
  runId: string;
  linkedinUrl: string;
  accountName?: string;
  model?: string;
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

function currentMonth(): string {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export async function linkedinAuditWorkflow(input: LinkedInAuditInput): Promise<void> {
  const { runId, linkedinUrl, accountName, model } = input;

  try {
    const scraped = await scrapeLinkedInProfile(linkedinUrl);

    const claudeOutput = await runClaudeAgent({
      prompt: AUDIT_PROMPT(scraped.slug, currentMonth()),
      model: model || "claude-opus-4-6",
      maxTurns: 15,
      allowedTools: ["Read"],
      setupFiles: {
        "scraped-profile.json": JSON.stringify(scraped.profileData, null, 2),
        "scraped-posts.json": JSON.stringify(scraped.postsData, null, 2),
      },
    });

    const uploadResult = await buildAndUploadAuditDocx({
      claudeOutput,
      accountName,
    });

    await updateToolRun({
      runId,
      status: "completed",
      output: `Audit document saved: MVRX | LinkedIn Audit.docx`,
      outputUrl: uploadResult.webViewLink,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await updateToolRun({
      runId,
      status: "failed",
      error: errorMessage,
    });

    await notifySlackFailure({
      tool: "linkedin-audit",
      error: errorMessage,
      runId,
    });

    throw ApplicationFailure.nonRetryable(errorMessage);
  }
}
