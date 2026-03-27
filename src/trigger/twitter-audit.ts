import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { scrapeProfileTweets, extractHandle } from "@/lib/twitter-engagement-bot";
import { buildTwitterAuditDocx } from "@/lib/twitter-audit-docx/builder";
import { postProcessTwitterAudit } from "@/lib/twitter-audit-post-process";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, uploadFile } from "@/lib/gdrive";
import type { TwitterAuditContent } from "@/lib/audit-schema";
import { resolveModel, MODEL_MAP, currentMonth, extractJSON, extractJSONFromSessionDir } from "@/lib/audit-utils";
import { buildAntiAIVocabBlock } from "@/lib/humanisation";

interface TwitterAuditPayload {
  runId: string;
  twitterUrl: string;
  accountName?: string;
  model?: string;
}

function buildAuditPrompt(handle: string, date: string): string {
  return `You are creating a comprehensive Twitter/X audit for @${handle} (https://x.com/${handle}).

STEP 1 — DATA COLLECTION:
Read the scraped tweets from scraped-tweets.json. Analyse the account thoroughly.

STEP 2 — BENCHMARK RESEARCH:
Use WebSearch to find 10 benchmark accounts relevant to this person's industry, role, and content niche. Search for "[industry] thought leaders Twitter", "best [niche] Twitter creators", "top [industry] accounts X". Use WebFetch to verify accounts are real and active. Each benchmark should be someone this person can learn from or compete with.

STEP 3 — ANALYSIS:
Produce a detailed, opinionated audit. Be direct and punchy — use short sentences, strong opinions, and reference actual data. Give honest scores.

Output your analysis as a **single JSON object** matching this TypeScript schema:

interface TwitterAuditContent {
  personName: string;            // full name
  personTitle: string;           // current role + company (short form, e.g. "CEO, Acme Corp")
  twitterHandle: string;         // "${handle}"
  preparedDate: string;          // "${date}"
  executiveSummary: string[];    // 5-6 concise bullet point strings (each 1-2 sentences, scannable)
  overallScore: number;          // 0.0-10.0 (one decimal place)
  scorecard: Array<{
    category: string;            // e.g. "Bio & Profile"
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

SCORECARD CATEGORIES (always include all 8, in this order):
Bio & Profile, Pinned Tweet, Content Volume, Content Quality, Thread Strategy, Engagement Rate, Reply Engagement, Network & Influence

SECTIONS TO INCLUDE (in this order, using these exact titles):
1. "Profile Deep Dive" — subsections: Bio & Handle, Pinned Tweet, Profile Image & Banner, Link & CTA. For each subsection: state the current situation with specific detail, give your assessment, then weave recommendations naturally into the prose. Do NOT use labeled "Recommendation:" blocks.

2. "Content Strategy Audit" — start with a metrics summary "table" block (columns: Metric, Value) covering total tweets analysed, original vs retweets, posting cadence, thread %, top tweet by engagement, avg likes/retweets/views. Then add a "Key finding:" paragraph. Then add analysis subsections as appropriate (e.g. content performance, content mix analysis, voice and positioning).

3. "Thread Analysis" — no subsections. Brief intro paragraph, then analysis of thread usage, length, completion rates. Include a table if there's enough thread data (columns: Thread Topic, Tweets, Engagement). Follow with recommendations for thread strategy.

4. "Engagement Analysis" — no subsections. Reply rate, quote tweet usage, community interaction patterns. Are they replying to others? Building relationships? Include specific data points.

5. "Benchmark Accounts" — no subsections. Use the accounts you found via WebSearch in Step 2. Brief intro paragraph explaining why these accounts matter, then a "table" block with columns: Name, Handle, Why They Matter. Include 10 accounts that are real, currently active on Twitter/X, and relevant to this person's niche. End with an action paragraph about engaging with these accounts.

6. "Recommendations" — two subsections: "Immediate Fixes (This Week)" using a "bulletList" block with specific actions, and "Content Strategy (Next 90 Days)" with prose paragraphs describing the target content lane, followed by a "Content Rules" "bulletList" block with 4-5 specific rules.

7. "Sample Content Calendar: Week 1" — no subsections. Brief intro, then a "table" block with columns: Day, Tweet/Thread Concept & Hook. Include 5 entries (Monday through Friday). Each hook should be a ready-to-use opening line in quotes.

8. "Priority Matrix" — no subsections. A "table" block with columns: #, Action, Effort, Impact, Timeline. Include 7-9 prioritised actions.

9. "Growth Projections" — no subsections. A "table" block with columns: Metric, Current, 3-Month Target, 6-Month Target. Include 5-6 metrics (followers, posting cadence, avg views, engagement rate, bookmark rate, thread completion).

10. "Final Assessment" — no subsections. 2-3 paragraphs giving an honest overall assessment. End with a punchy forward-looking statement. Use a direct, confident tone.

TWITTER-SPECIFIC ANALYSIS POINTS (weave these into relevant sections):
- Views/impressions ratio to followers (is content reaching beyond followers?)
- Bookmark rate (indicator of high-value content)
- Reply-to-like ratio (indicator of conversation-driving content)
- Thread completion rate (do threads maintain engagement through the end?)
- Best posting times (infer from highest-performing tweets)
- Hashtag usage (helpful or harmful for this account?)

TONE AND STYLE:
- Write like a sharp strategist, not a consultant. Be direct and opinionated.
- Use short, punchy sentences. Avoid filler words and corporate language.
- When something is bad, say it plainly (e.g. "No pinned tweet. That's free real estate being wasted.").
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

${buildAntiAIVocabBlock()}

CRITICAL: Your final text response MUST contain the raw JSON object directly — not in a file, not as a summary.
Do NOT use the Write tool to save the JSON to a file. Do NOT summarise the results.
Just output the raw JSON object as your final message. No markdown formatting, no code fences, no text before or after — only the JSON.`;
}

export const twitterAuditTask = task({
  id: "twitter-audit-generation",
  maxDuration: 1800,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: TwitterAuditPayload, { signal }) => {
    const { runId, twitterUrl, accountName, model } = payload;

    try {
      const totalSteps = 7;
      metadata.set("progress", {
        step: "Scraping Twitter profile",
        stepNumber: 1,
        totalSteps,
        percentage: 0,
      });

      const handle = extractHandle(twitterUrl) || twitterUrl;
      logger.info("Starting Twitter scrape via Apify", { runId, twitterUrl, handle });
      const scrapeStart = Date.now();
      const { rawTweets } = await scrapeProfileTweets(twitterUrl, 50, signal);
      const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
      logger.info(`Scrape finished in ${scrapeElapsed}s — ${rawTweets.length} tweets`);

      metadata.set("progress", {
        step: "Preparing data for analysis",
        stepNumber: 2,
        totalSteps,
        percentage: 15,
      });

      const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "scraped-tweets.json"), JSON.stringify(rawTweets, null, 2), "utf-8");

      const preparedDate = currentMonth();
      const resolvedModel = resolveModel(model, MODEL_MAP.opus);

      metadata.set("progress", {
        step: "Running AI analysis",
        stepNumber: 3,
        totalSteps,
        percentage: 20,
      });
      logger.info("Starting Claude Agent SDK", { model: resolvedModel });
      const claudeStart = Date.now();
      let output = "";

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      try {
        for await (const message of query({
          prompt: buildAuditPrompt(handle, preparedDate),
          options: {
            model: resolvedModel,
            abortController,
            cwd: sessionDir,
            allowedTools: ["Read", "WebSearch", "WebFetch"],
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            maxTurns: 40,
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
        percentage: 65,
      });

      let json: string;
      try {
        json = extractJSON(output);
      } catch {
        logger.info("JSON not found in text output, scanning session directory");
        json = await extractJSONFromSessionDir(sessionDir);
      }
      const rawContent: TwitterAuditContent = JSON.parse(json);

      metadata.set("progress", {
        step: "Post-processing report text",
        stepNumber: 5,
        totalSteps,
        percentage: 70,
      });

      logger.info("Post-processing: removing AI writing patterns and improving scannability");
      const content = await postProcessTwitterAudit(rawContent, logger);

      logger.info("Building DOCX");
      const buf = await buildTwitterAuditDocx(content);

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

      const filename = `MVRX | @${handle} | Twitter Audit.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, buf, DOCX_MIME, targetFolderId);
      logger.info(`DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(buf.length / 1024).toFixed(0)} KB)`);

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      metadata.set("progress", { step: "Complete", stepNumber: 7, totalSteps, percentage: 100 });

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
      logger.error(`Twitter audit failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "twitter-audit",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
