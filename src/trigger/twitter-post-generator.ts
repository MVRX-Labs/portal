import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";
import {
  findOrCreateFolder,
  getGeneratedMaterialsFolderId,
  createGoogleDoc,
  markdownToGoogleDocHtml,
} from "@/lib/gdrive";
import { getRandomHookTemplates, formatHookTemplatesForPrompt } from "./linkedin-hook-templates";
import {
  resolveCreativeDirection,
  buildSingleTweetSection,
  buildThreadSection,
  buildLongPostSection,
  type TwitterPostFormat,
} from "@/lib/twitter-post-prompts";
import { buildAntiAIVocabBlock, buildHumanisationPassBlock } from "@/lib/humanisation";
import { runClaudeAgent } from "@/lib/claude-agent";

interface TwitterPostGeneratorPayload {
  runId: string;
  posterName: string;
  posterRole: string;
  sourceMaterial: string;
  voiceContext?: string;
  model?: string;
  accountName?: string;
  promptStyle?: string;
  customPrompt?: string;
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  const cleaned = matches.map((url) => url.replace(/[.,!?;:)\]]+$/g, "")).filter(Boolean);
  return Array.from(new Set(cleaned));
}

// ---------------------------------------------------------------------------
// Prompt builder — parameterised by format
// ---------------------------------------------------------------------------

function buildFormatPrompt(
  format: TwitterPostFormat,
  posterName: string,
  posterRole: string,
  hasVoiceContext: boolean,
  sourceUrls: string[],
  customPrompt?: string,
  promptStyle?: string
): string {
  const hasSourceUrls = sourceUrls.length > 0;

  // --- Creative direction (shared across all formats) ---
  const creativeDirection = resolveCreativeDirection(posterName, customPrompt, promptStyle);

  // --- File reading instructions (shared) ---
  const fileInstructions = [
    "Read source-material.txt for the raw material to base the content on.",
    hasSourceUrls && "Read source-urls.txt for links detected in the source material.",
    hasVoiceContext &&
      "Read voice-context.txt for the client's style guide, past tweets, or tone description. Analyze it for voice patterns before writing.",
  ]
    .filter(Boolean)
    .join("\n");

  // --- URL extraction step (shared) ---
  const urlExtractionStep = hasSourceUrls
    ? `## STEP 1.5: EXTRACT LINK CONTENT (MANDATORY)

The source material includes URL(s). Before writing, use WebFetch on each URL from source-urls.txt and extract concrete facts, quotes, and data points.

- Treat link content as primary source material.
- If a URL is inaccessible, continue with available content. Do NOT keep retrying.
- If a page returns empty/minimal content, do a WebSearch for the article title instead.
`
    : "";

  // --- Voice analysis (shared) ---
  const voiceAnalysis = hasVoiceContext
    ? `Before writing, analyze the voice material and identify:
- Sentence length patterns and vocabulary
- Contraction habits and formality level
- How they use Twitter specifically (thread style, emoji usage, hashtag usage)
- What they never do

Use these patterns to guide your writing.`
    : `No voice samples were provided. Default to conversational, direct, and slightly opinionated. Match Twitter's natural voice.`;

  // --- Source link guidance (shared) ---
  const sourceLinkGuidance = hasSourceUrls
    ? `- Include a source link naturally: "Wrote more about this here:" or "Full breakdown:" — not as a promotional CTA
- Frame it as sharing your own writing, not promoting a brand`
    : `- There is no linked article. Do NOT fabricate or invent a link. The content must stand on its own.`;

  // --- Format-specific hard rules ---
  const charLimitRule =
    format === "long-post"
      ? `**RULE 1: The first paragraph must be under 280 characters.** This is the timeline preview. The full post can be up to 25,000 characters.`
      : `**RULE 1: Every tweet must be under 280 characters.** No exceptions. Count carefully.`;

  // --- Format-specific creative section + self-edit ---
  let creativeSection: string;
  let selfEditProtocol: string;

  if (format === "single-tweet") {
    const randomHooks = getRandomHookTemplates(5);
    const hookInspiration = formatHookTemplatesForPrompt(randomHooks);
    const hookInspirationSection = `### HOOK TEMPLATE INSPIRATION

Below are ${randomHooks.length} hook structures for inspiration. Adapt them for a single tweet.

${hookInspiration}`;

    creativeSection = buildSingleTweetSection(
      posterName,
      creativeDirection,
      hookInspirationSection,
      sourceLinkGuidance
    );

    selfEditProtocol = `After writing, scan each tweet:
1. Character count: is every tweet under 280 characters? If not, cut ruthlessly.
2. Em-dash scan: replace every single one. Target: ZERO.
3. AI vocabulary scan: check against the banned word list.
4. Sales pitch scan: does any tweet primarily make the company look good? Rewrite it.
5. Standalone test: does the tweet deliver its full value in isolation?
6. Third-person scan: any reference to ${posterName} in the third person? Rewrite as first person.`;
  } else if (format === "long-post") {
    creativeSection = buildLongPostSection(posterName, creativeDirection, sourceLinkGuidance);

    selfEditProtocol = `After writing, review each version:
1. Opening check: are the first 280 characters compelling enough to stop a scroll? If not, rewrite.
2. Paragraph length: is any paragraph longer than 3 sentences? Break it up.
3. Depth check: does the post go genuinely deeper than a thread could? If any section is surface-level, add specifics.
4. Em-dash scan: replace every single one. Target: ZERO.
5. AI vocabulary scan: check against the banned word list.
6. Sales pitch scan: does any section primarily make the company look good? Rewrite it.
7. Scannability test: can a reader who skims headers and bold text get the key points? If not, restructure.
8. Third-person scan: any reference to ${posterName} in the third person? Rewrite as first person.
9. Word count: is each version between 800 and 2,000 words? Trim or expand as needed.`;
  } else {
    // Thread format
    const randomHooks = getRandomHookTemplates(5);
    const hookInspiration = formatHookTemplatesForPrompt(randomHooks);
    const hookInspirationSection = `### HOOK TEMPLATE INSPIRATION

Below are ${randomHooks.length} hook structures chosen at random for inspiration. Adapt them for Twitter's 280-character limit — use them as structural starting points, not verbatim templates.

${hookInspiration}

After reviewing these templates, generate your 3 hooks. Each must be a single tweet (max 280 characters).`;

    creativeSection = buildThreadSection(posterName, creativeDirection, hookInspirationSection, sourceLinkGuidance);

    selfEditProtocol = `After writing, scan each tweet:
1. Character count: is every tweet under 280 characters? If not, cut ruthlessly.
2. Em-dash scan: replace every single one. Target: ZERO.
3. AI vocabulary scan: check against the banned word list.
4. Sales pitch scan: does any tweet primarily make the company look good? Rewrite it.
5. Standalone test: does each tweet deliver value even if read alone?
6. Forward pull: does each body tweet end with a reason to read the next?
7. Third-person scan: any reference to ${posterName} in the third person? Rewrite as first person.`;
  }

  // --- Assemble the full prompt ---
  return `You are an expert Twitter/X ghostwriter. You write content for senior figures at client organisations. Your job is to produce content that sounds like it was typed by the person posting — not by an agency, not by AI. Every piece should feel sharp, specific, and human.

You are writing for: ${posterName}, ${posterRole}

## CRITICAL IDENTITY RULE

${posterName} is the author of the source material. Write in FIRST PERSON from ${posterName}'s perspective. Never refer to ${posterName} or their company in the third person.

- BANNED: "${posterName}'s team built..." or "The team at [Company] released..."
- GOOD: "We spent three months rebuilding..." / "I wrote about this because..."

## STEP 1: READ THE SOURCE FILES

${fileInstructions}

${urlExtractionStep}## STEP 2: VOICE ANALYSIS

${voiceAnalysis}

## STEP 3: WRITE THE CONTENT

### HARD RULES (ZERO TOLERANCE)

${charLimitRule}

**RULE 2: Zero em-dashes.** Use commas, periods, colons, or dashes instead.

**RULE 3: Zero company pitching.** The content sells the IDEA, never the company. ${posterName} is sharing genuine insight, not promoting.

**RULE 4: Zero AI-speak.** No formulaic hooks, no buzzwords, no predictable structures.

**RULE 5: Zero echo-line poetics.** Never restate the same idea in slightly different words in consecutive sentences.

### ${buildAntiAIVocabBlock()}

${creativeSection}

## STEP 4: SELF-EDIT PROTOCOL (MANDATORY)

${selfEditProtocol}

## STEP 5: HUMANIZATION PASS

After the self-edit:
${buildHumanisationPassBlock()}

## CRITICAL OUTPUT RULE

Your response must contain ONLY the structured output sections specified in the output format above. Do NOT include:
- Process notes ("Let me read the files...", "Now I'll compile...", "The source material discusses...")
- Thinking or analysis commentary
- Preamble or introduction before the first section heading
- Summary or sign-off after the last section

Start your response directly with the first heading. End with the last item in the output format. Nothing before, nothing after.`;
}

// ---------------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------------

const FORMATS: TwitterPostFormat[] = ["single-tweet", "thread", "long-post"];

const MAX_TURNS_BY_FORMAT: Record<TwitterPostFormat, number> = {
  "single-tweet": 15,
  thread: 30,
  "long-post": 25,
};

export const twitterPostGeneratorTask = task({
  id: "twitter-post-generator",
  maxDuration: 1800,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: TwitterPostGeneratorPayload) => {
    const {
      runId,
      posterName,
      posterRole,
      sourceMaterial,
      voiceContext,
      model,
      accountName,
      promptStyle,
      customPrompt,
    } = payload;

    try {
      const totalSteps = 3;
      metadata.set("progress", {
        step: "Preparing source material",
        stepNumber: 1,
        totalSteps,
        percentage: 5,
      });

      const resolvedModel = resolveModel(model, MODEL_MAP.sonnet);
      logger.info("Starting Twitter post generator (3 formats in parallel)", {
        runId,
        posterName,
        model: resolvedModel,
        hasVoiceContext: !!voiceContext,
      });

      const sourceUrls = extractUrls(sourceMaterial);

      // Create separate session dirs per format to avoid agent conflicts
      const sessionDirs = await Promise.all(
        FORMATS.map(async (format) => {
          const dir = join(tmpdir(), `claude-session-${format}-${randomUUID()}`);
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, "source-material.txt"), sourceMaterial, "utf-8");
          if (sourceUrls.length > 0) {
            await writeFile(join(dir, "source-urls.txt"), sourceUrls.join("\n"), "utf-8");
          }
          if (voiceContext) {
            await writeFile(join(dir, "voice-context.txt"), voiceContext, "utf-8");
          }
          return dir;
        })
      );

      // Build a prompt per format — creative direction is shared via customPrompt/promptStyle
      const prompts = FORMATS.map((format) =>
        buildFormatPrompt(format, posterName, posterRole, !!voiceContext, sourceUrls, customPrompt, promptStyle)
      );

      metadata.set("progress", {
        step: "Generating content (3 formats in parallel)",
        stepNumber: 2,
        totalSteps,
        percentage: 15,
      });

      logger.info("Starting 3 parallel Claude agents", { model: resolvedModel });
      const claudeStart = Date.now();

      // Run all 3 formats in parallel
      const results = await Promise.all(
        FORMATS.map((format, i) =>
          runClaudeAgent(prompts[i], sessionDirs[i], {
            allowedTools: ["Read", "WebFetch"],
            maxTurns: MAX_TURNS_BY_FORMAT[format],
            model: resolvedModel,
          }).then((result) => {
            logger.info(
              `${format} complete: ${result.turns} turns, $${result.costUsd.toFixed(4)}, ${result.durationMs}ms`
            );
            return result;
          })
        )
      );

      const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
      const claudeElapsed = ((Date.now() - claudeStart) / 1000).toFixed(1);
      logger.info(`All 3 formats complete in ${claudeElapsed}s. Total cost: $${totalCost.toFixed(4)}`);

      // Clean up session dirs
      await Promise.all(sessionDirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => {})));

      // Combine outputs into a single document
      const output = `# OPTION 1: SINGLE TWEET

${results[0].output}

---

# OPTION 2: THREAD

${results[1].output}

---

# OPTION 3: LONG POST (PREMIUM)

${results[2].output}`;

      metadata.set("progress", {
        step: "Uploading to Google Drive",
        stepNumber: totalSteps,
        totalSteps,
        percentage: 90,
      });

      const rootFolderId = getGeneratedMaterialsFolderId();
      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const filename = `MVRX | ${posterName} | Twitter Content`;
      const htmlOutput = markdownToGoogleDocHtml(output);
      const driveFile = await createGoogleDoc(filename, htmlOutput, targetFolderId, "text/html");
      logger.info(`Google Doc created: ${driveFile.webViewLink}`);

      metadata.set("progress", {
        step: "Complete",
        stepNumber: totalSteps,
        totalSteps,
        percentage: 100,
      });

      const outputMessage = `Content document saved: ${filename}`;
      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: outputMessage,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("Twitter post generator completed", {
        runId,
        outputLength: output.length,
        driveUrl: driveFile.webViewLink,
        totalCost: totalCost.toFixed(4),
      });

      return { success: true, filename, driveUrl: driveFile.webViewLink, totalCost };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Twitter post generator failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "twitter-post-generator",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
