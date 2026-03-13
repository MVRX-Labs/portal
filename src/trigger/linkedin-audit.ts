import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { scrapeLinkedInProfile } from "@/lib/linkedin-audit";
import { buildAuditDocx } from "@/lib/linkedin-audit-docx/builder";
import { postProcessAudit } from "@/lib/audit-post-process";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, uploadFile } from "@/lib/gdrive";
import type { LinkedInAuditContent } from "@/lib/audit-schema";
import { resolveModel, MODEL_MAP, currentMonth, extractJSON, extractJSONFromSessionDir } from "@/lib/audit-utils";

interface LinkedInAuditPayload {
  runId: string;
  linkedinUrl: string;
  accountName?: string;
  model?: string;
}

const AUDIT_PROMPT = (slug: string, date: string) => `\
You are creating a comprehensive LinkedIn audit for https://www.linkedin.com/in/${slug}.

STEP 1 — DATA COLLECTION:
Read the scraped profile data from scraped-profile.json and the posts data from scraped-posts.json.
Analyse the profile thoroughly.

STEP 2 — BENCHMARK RESEARCH:
Use WebSearch to find 10 benchmark accounts relevant to this person's industry, role, and content niche. Search for "[industry] thought leaders LinkedIn", "best [niche] LinkedIn creators", competitors at peer companies, etc. Use WebFetch to verify accounts are real and active. Each benchmark should be someone this person can learn from or compete with.

STEP 3 — ANALYSIS:
Produce a detailed, opinionated audit. Be direct and punchy — use short sentences, strong opinions, and reference actual data. Give honest scores.

Output your analysis as a **single JSON object** matching this TypeScript schema:

interface LinkedInAuditContent {
  personName: string;            // full name
  personTitle: string;           // current role + company (short form, e.g. "Visiting Partner, a16z Speedrun")
  linkedinSlug: string;          // "${slug}"
  preparedDate: string;          // "${date}"
  executiveSummary: string[];    // 5-6 concise bullet point strings (each 1-2 sentences, scannable)
  overallScore: number;          // 0.0-10.0 (one decimal place)
  scorecard: Array<{
    category: string;            // e.g. "Headline"
    score: number;               // 0-10 integer
    commentary: string;          // 2-3 sentence commentary explaining the score
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
  | { type: "labeled"; label: string; text: string }
  | { type: "bulletList"; items: Array<{ label?: string; text: string }> }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }

SCORECARD CATEGORIES (always include all 10, in this order):
Headline, About Section, Experience, Education, Featured, Visual Brand, Content Volume, Content Quality, Engagement, Network

SECTIONS TO INCLUDE (in this order, using these exact titles):
1. "Profile Deep Dive" — subsections: Headline, About Section, Experience Section, Featured Section, Visual Identity. For each subsection: state the current situation with specific detail, give your assessment, then weave recommendations naturally into the prose. Do NOT use labeled "Recommendation:" blocks.

2. "Content Strategy Audit" — start with a metrics summary "table" block (columns: Metric, Value) covering total posts analysed, original vs reposts, posting cadence, thought leadership percentage, video content count, and top post. Then add a "Key finding:" paragraph. Then add analysis subsections as appropriate (e.g. content performance table, content mix analysis, voice and positioning).

3. "Content Pillar Analysis" — no subsections. Brief intro paragraph, then a "table" block with columns: Pillar, Posts, Assessment. Include 4-6 content pillars. Follow with a paragraph about the person's natural voice and strongest content themes.

4. "Benchmark Accounts" — no subsections. Use the accounts you found via WebSearch in Step 2. Brief intro paragraph explaining why these accounts matter, then a "table" block with columns: Name, Company / Role, Why They Matter. Include 10 accounts that are real, currently active on LinkedIn, and relevant to this person's niche. End with an action paragraph about engaging with these accounts.

5. "Recommendations" — two subsections: "Immediate Fixes (This Week)" using a "bulletList" block with specific actions, and "Content Strategy (Next 90 Days)" with prose paragraphs describing the target content lane, followed by a "Content Rules" "bulletList" block with 4-5 specific rules.

6. "Sample Content Calendar: Week 1" — no subsections. Brief intro, then a "table" block with columns: Day, Post Concept & Hook. Include 5 entries (Monday through Friday). Each hook should be a ready-to-use opening line in quotes.

7. "Priority Matrix" — no subsections. A "table" block with columns: #, Action, Effort, Impact, Timeline. Include 7-9 prioritised actions.

8. "Growth Projections" — no subsections. A "table" block with columns: Metric, Current, 3-Month Target, 6-Month Target. Include 5-6 metrics (followers, posting cadence, thought leadership %, repost %, engagement quality, follower ratio).

9. "Final Assessment" — no subsections. 3-4 paragraphs giving an honest overall assessment. End with a punchy forward-looking statement. Use a direct, confident tone.

TONE AND STYLE:
- Write like a sharp strategist, not a consultant. Be direct and opinionated.
- Use short, punchy sentences. Avoid filler words and corporate language.
- When something is bad, say it plainly (e.g. "Empty. No about section at all. This is the most costly gap on the profile.").
- When something is good, acknowledge it without hedging.
- Reference specific data points throughout: follower counts, engagement stats, dates, percentages.
- Subsection titles should be plain text (no numbering like "3.1" or "1.2").
- Integrate recommendations into the analysis prose rather than separating them into labeled blocks.

BREVITY — THIS IS CRITICAL:
- Keep every paragraph to 2-3 sentences maximum. If a paragraph is longer, split it or cut it.
- Each scorecard commentary should be exactly 2-3 sentences, no more.
- Executive summary bullets: one sentence each, two at most.
- Profile Deep Dive subsections: state what's there, what's wrong, what to do. No padding.
- Content Strategy tables speak for themselves — add only a short "Key finding:" line, not paragraphs of analysis restating what the table shows.
- Recommendations: action items only, no justification paragraphs. The reader already read the analysis.
- Final Assessment: 2-3 short paragraphs. End sharp.
- The entire report should feel tight and scannable. Every sentence must earn its place. If a sentence could be cut without losing meaning, cut it.

CRITICAL: Your final text response MUST contain the raw JSON object directly — not in a file, not as a summary.
Do NOT use the Write tool to save the JSON to a file. Do NOT summarise the results.
Just output the raw JSON object as your final message. No markdown formatting, no code fences, no text before or after — only the JSON.`;

export const linkedinAuditTask = task({
  id: "linkedin-audit-generation",
  maxDuration: 3600,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: LinkedInAuditPayload, { signal }) => {
    const { runId, linkedinUrl, accountName, model } = payload;

    try {
      const totalSteps = 6;
      metadata.set("progress", {
        step: "Scraping LinkedIn profile",
        stepNumber: 1,
        totalSteps,
        percentage: 0,
      });

      logger.info("Starting LinkedIn scrape via Apify", { runId, linkedinUrl });
      const scrapeStart = Date.now();
      const scrapedData = await scrapeLinkedInProfile(linkedinUrl, signal);
      const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
      logger.info(`Scrape finished in ${scrapeElapsed}s`, { slug: scrapedData.slug });

      metadata.set("progress", {
        step: "Preparing data for analysis",
        stepNumber: 2,
        totalSteps,
        percentage: 20,
      });

      const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);
      await mkdir(sessionDir, { recursive: true });
      await writeFile(
        join(sessionDir, "scraped-profile.json"),
        JSON.stringify(scrapedData.profileData, null, 2),
        "utf-8"
      );
      await writeFile(join(sessionDir, "scraped-posts.json"), JSON.stringify(scrapedData.postsData, null, 2), "utf-8");

      const preparedDate = currentMonth();
      const resolvedModel = resolveModel(model, MODEL_MAP.opus);

      metadata.set("progress", {
        step: "Running AI analysis",
        stepNumber: 3,
        totalSteps,
        percentage: 30,
      });
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
            allowedTools: ["Read", "WebSearch", "WebFetch"],
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            maxTurns: 25,
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

      metadata.set("progress", {
        step: "Building document",
        stepNumber: 4,
        totalSteps,
        percentage: 70,
      });

      let json: string;
      try {
        json = extractJSON(output);
      } catch {
        logger.info("JSON not found in text output, scanning session directory");
        json = await extractJSONFromSessionDir(sessionDir);
      }
      const rawContent: LinkedInAuditContent = JSON.parse(json);

      metadata.set("progress", {
        step: "Post-processing report text",
        stepNumber: 5,
        totalSteps,
        percentage: 72,
      });

      logger.info("Post-processing: removing AI writing patterns and improving scannability");
      const content = await postProcessAudit(rawContent, logger);

      logger.info("Building DOCX");
      const buf = await buildAuditDocx(content);

      metadata.set("progress", {
        step: "Uploading to Google Drive",
        stepNumber: 6,
        totalSteps,
        percentage: 85,
      });

      const rootFolderId = getGeneratedMaterialsFolderId();

      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const filename = `MVRX | ${content.personName} | LinkedIn Audit.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, buf, DOCX_MIME, targetFolderId);
      logger.info(`DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(buf.length / 1024).toFixed(0)} KB)`);

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      metadata.set("progress", { step: "Complete", stepNumber: 6, totalSteps, percentage: 100 });
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
