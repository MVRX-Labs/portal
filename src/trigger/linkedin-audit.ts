import { task, logger } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { scrapeLinkedInProfile } from "@/lib/linkedin-audit";
import { buildAuditDocx } from "@/lib/audit-docx-builder";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, uploadFile } from "@/lib/gdrive";
import type { LinkedInAuditContent } from "@/lib/audit-schema";
import {
  resolveModel,
  MODEL_MAP,
  currentMonth,
  extractJSON,
  extractJSONFromSessionDir,
} from "@/lib/audit-utils";

interface LinkedInAuditPayload {
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

export const linkedinAuditTask = task({
  id: "linkedin-audit-generation",
  maxDuration: 3600,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: LinkedInAuditPayload, { signal }) => {
    const { runId, linkedinUrl, accountName, model } = payload;

    try {
      // 1. Scrape LinkedIn profile via Apify
      logger.info("Starting LinkedIn scrape via Apify", { runId, linkedinUrl });
      const scrapeStart = Date.now();
      const scrapedData = await scrapeLinkedInProfile(linkedinUrl, signal);
      const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
      logger.info(`Scrape finished in ${scrapeElapsed}s`, { slug: scrapedData.slug });

      // 2. Set up session directory with scraped data for Claude
      const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "scraped-profile.json"), JSON.stringify(scrapedData.profileData, null, 2), "utf-8");
      await writeFile(join(sessionDir, "scraped-posts.json"), JSON.stringify(scrapedData.postsData, null, 2), "utf-8");

      const preparedDate = currentMonth();
      const resolvedModel = resolveModel(model, MODEL_MAP.opus);

      // 3. Run Claude Agent SDK
      logger.info("Starting Claude Agent SDK", { model: resolvedModel });
      const claudeStart = Date.now();
      let output = "";

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      try {
        for await (const message of query({
          prompt: AUDIT_PROMPT(scrapedData.slug, preparedDate),
          options: {
            model: resolvedModel,
            abortController,
            cwd: sessionDir,
            allowedTools: ["Read"],
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            maxTurns: 15,
            persistSession: false,
          },
        })) {
          if (message.type === "system" && "subtype" in message && message.subtype === "init") {
            logger.info("Claude session initialized", { model: (message as any).model });
          }

          if (message.type === "assistant" && message.message?.content) {
            for (const block of message.message.content) {
              if ("text" in block && block.text) {
                const preview = block.text.length > 150 ? block.text.slice(0, 150) + "..." : block.text;
                logger.info(`Claude: ${preview}`);
              } else if ("name" in block) {
                logger.info(`Tool call: ${(block as any).name}`);
              }
            }
          }

          if (message.type === "result") {
            if (message.subtype === "success") {
              output = message.result;
              const cost = message.total_cost_usd.toFixed(4);
              logger.info(`Claude finished: ${message.num_turns} turns, $${cost}, ${message.duration_ms}ms`);
            } else {
              const msg = message as any;
              const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
              throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
            }
          }
        }
      } catch (sdkErr) {
        if (sdkErr instanceof Error && sdkErr.message.startsWith("Claude finished with")) {
          throw sdkErr;
        }
        const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
        throw new Error(`Claude API request failed: ${msg}`);
      }

      const claudeElapsed = ((Date.now() - claudeStart) / 1000).toFixed(1);
      logger.info(`Claude finished in ${claudeElapsed}s (output: ${output.length} chars)`);

      // 4. Extract JSON and parse audit content
      let json: string;
      try {
        json = extractJSON(output);
      } catch {
        logger.info("JSON not found in text output, scanning session directory");
        json = await extractJSONFromSessionDir(sessionDir);
      }
      const content: LinkedInAuditContent = JSON.parse(json);

      // 5. Build DOCX
      logger.info("Building DOCX");
      const buf = await buildAuditDocx(content);

      // 6. Upload to Google Drive via API
      const rootFolderId = process.env.GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID;
      if (!rootFolderId) throw new Error("GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID not configured");

      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const filename = `MVRX | ${content.personName} | LinkedIn Audit.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, buf, DOCX_MIME, targetFolderId);
      logger.info(`DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(buf.length / 1024).toFixed(0)} KB)`);

      // 7. Clean up session directory
      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      // 8. Update DB — mark as completed
      const outputMessage = `Audit document saved: ${filename}`;
      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: outputMessage,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("Run marked as completed in DB", { runId });

      return { success: true, filename, driveUrl: driveFile.webViewLink };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Job failed: ${errorMessage}`, { runId });

      // Update DB — mark as failed
      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "linkedin-audit",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
