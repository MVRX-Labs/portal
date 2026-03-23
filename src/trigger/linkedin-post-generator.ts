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
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, createGoogleDoc } from "@/lib/gdrive";
import { getRandomHookTemplates, formatHookTemplatesForPrompt } from "./linkedin-hook-templates";
import { LINKEDIN_POST_PROMPT_PRESETS, resolveLinkedInPromptTemplate } from "@/lib/linkedin-post-prompts";
import { buildAntiAIVocabBlock, buildHumanisationPassBlock } from "@/lib/humanisation";

interface LinkedInPostGeneratorPayload {
  runId: string;
  posterName: string;
  posterRole: string;
  sourceMaterial: string;
  voiceContext?: string;
  linkedinUrl?: string;
  useLinkedinProfile?: boolean;
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

function buildPrompt(
  posterName: string,
  posterRole: string,
  hasScrapedData: boolean,
  hasVoiceContext: boolean,
  sourceUrls: string[],
  promptStyle?: string,
  customPrompt?: string
): string {
  const randomHooks = getRandomHookTemplates(5);
  const hookInspiration = formatHookTemplatesForPrompt(randomHooks);
  const hookCount = randomHooks.length;

  const hasSourceUrls = sourceUrls.length > 0;
  const hasGranolaUrl = sourceUrls.some((url) => url.toLowerCase().includes("granola"));
  const fileInstructions = [
    "Read source-material.txt for the raw material to base the post on.",
    hasSourceUrls && "Read source-urls.txt for links detected in the source material (including meeting-note links).",
    hasVoiceContext &&
      "Read voice-context.txt for the client's style guide, past posts, or tone description. Analyze it for voice patterns before writing.",
    hasScrapedData &&
      "Read scraped-profile.json and scraped-posts.json for the client's LinkedIn profile data and recent posts. Extract voice patterns: sentence structure, vocabulary, contraction habits, hedging vs. confidence, opening/closing habits, and any distinctive quirks.",
  ]
    .filter(Boolean)
    .join("\n");

  // --- Resolve the style template (presets or custom) ---

  let styleTemplate: string;
  if (customPrompt && customPrompt.trim()) {
    styleTemplate = customPrompt;
  } else {
    const preset = LINKEDIN_POST_PROMPT_PRESETS[promptStyle || "default"] || LINKEDIN_POST_PROMPT_PRESETS.default;
    styleTemplate = preset.template;
  }

  const hookInspirationSection = `### HOOK TEMPLATE INSPIRATION

Below are ${hookCount} hook structures chosen at random for inspiration. Use them as structural starting points, not fill-in-the-blanks. Adapt the patterns to fit THIS specific story and ${posterName}'s voice. Do not use any template verbatim.

${hookInspiration}

After reviewing these templates, generate your 3 hooks. At least one hook should draw structural inspiration from one of the templates above, but rewritten to feel original and specific to this story.`;

  const bodyACta = hasSourceUrls
    ? `- The post should give away enough of the insight to be valuable on its own, but leave the full story, data, or methodology in the linked article. Create an "information gap" where the reader feels they got 60% of something fascinating and needs the other 40%.
- Include the source URL naturally as "I wrote more about this here" or "full breakdown is here" near the end. Frame it as sharing your own writing, not promoting a company page.
- Clear CTA at the end that invites the reader to read the linked article or engage with the idea (not "What do you think?" which is overused). The CTA should feel like a peer sharing something they wrote, not a brand asking for attention.`
    : `- The post should deliver the full insight within the post itself. The reader should walk away feeling they got something valuable without needing to click anywhere.
- Do NOT fabricate or invent a link. There is no linked article for this post.
- End with a CTA that invites conversation or reflection (not "What do you think?" which is overused). Ask a specific question tied to the post's insight, invite people to share a related experience, or end on a provocative open question. The CTA should feel like a peer starting a conversation, not a brand asking for engagement.`;

  const bodyBLink = hasSourceUrls
    ? `- If there's a source link, drop it in casually as your own work: "I tried to unpack this properly here" or "wrote my thinking up in full." Never frame it as "check out our latest post" or any promotional language.`
    : `- There is no linked article for this post. Do NOT invent or fabricate a link. Let the post's insight stand on its own.`;

  const resolvedStyle = resolveLinkedInPromptTemplate(styleTemplate, {
    posterName,
    hookInspirationSection,
    bodyACta,
    bodyBLink,
  });

  // --- Assemble: shared prefix + resolved style + shared suffix ---

  return `You are an expert LinkedIn ghostwriter. You write posts for senior figures at client organisations. Your job is to produce content that sounds like it was written by the person posting, not by an agency, not by AI. Every post should feel lived-in, specific, and human.

You are writing for: ${posterName}, ${posterRole}

## CRITICAL IDENTITY RULE

${posterName} is the author of (or a key contributor to) the source material. ${
    hasSourceUrls
      ? "The blog post, article, or content you are given was written by them, comes from their company, or reflects their direct experience."
      : `The source material may be raw notes, ideas, talking points, or an experience rather than a published article. Treat it as ${posterName}'s own thinking and direct experience.`
  } Write the LinkedIn post in FIRST PERSON from ${posterName}'s perspective as someone who lived this, built this, or wrote this. Never refer to ${posterName} or their company in the third person. Never write as an outside observer summarising someone else's work. The reader should feel ${posterName} is sharing their own thinking, not reporting on a company announcement.

- BANNED: "${posterName}'s team built..." or "The team at [Company] released..."
- BANNED: "This article by ${posterName} explores..."
- BANNED: "Check out what [Company] has been working on..."
- GOOD: "We spent three months rebuilding..." / "I wrote about this because..." / "Here's what we found when..."

## STEP 1: READ THE SOURCE FILES

${fileInstructions}

${
  hasSourceUrls
    ? `## STEP 1.5: EXTRACT LINK CONTENT (MANDATORY)

The source material includes URL(s). Before writing, use WebFetch on each URL from source-urls.txt and extract concrete facts, quotes, decisions, and action items.

- Treat link content as primary source material, especially if source-material.txt mostly contains links.
- If a URL is inaccessible (auth/paywall/expired), continue with available content and do not invent details.
- If a page returns empty, minimal, or placeholder content (e.g. a dynamically-rendered SPA), do NOT keep retrying the same URL or variations of it. Instead, do a WebSearch for the article title or topic to find alternative sources or summaries, then go from there.
- Prefer specific evidence from fetched pages: names, numbers, timestamps, direct phrasing.
${hasGranolaUrl ? "- At least one URL appears to be a Granola meeting-notes link. Prioritize extracting meeting summary, decisions, key quotes, owners, and next steps from that page." : ""}
`
    : ""
}

## STEP 2: VOICE ANALYSIS

${
  hasScrapedData || hasVoiceContext
    ? `Before writing, analyze the voice material and identify:
- First words of sentences (ratio of "I" vs "We" vs "The" vs other)
- Hedging vs. confidence patterns
- Contraction habits (contractions = informal; expanded forms = formal)
- How they end posts (question, statement, DM invitation)
- Industry shorthand they use without explaining
- What they never do (no humour? no doubt? no competitor mentions?)
- Sentence length range (shortest to longest)

Use these patterns to guide your writing.`
    : `No voice samples were provided. Default to conversational and direct. It's easier for a client to add formality than to strip away artificiality.`
}

## STEP 3: WRITE THE POST

### HARD RULES (ZERO TOLERANCE — violating any of these is a hard failure)

**RULE 1: Direct Affirmation only. Zero negative-positive restatements.**
Never say "Not X, but Y" or "It wasn't about X. It was about Y." or any soft-concession-then-pivot structure. State what something IS. Do not first say what it ISN'T.
- BANNED: "We didn't build a feature. We built a medium."
- BANNED: "That's fine for a prototype. For anything real, it's a problem."
- GOOD: "Most vibe-coded apps break the moment you need to extend them."
Zero instances per post.

**RULE 2: No Rule of Three (tricolons).**
Never stack three parallel clauses, phrases, or fragments for rhythmic effect. Three items of equal length feel assembled.
- BANNED: "No gaming engine. No 3D modeling. Just words."
- BANNED: "Some were architects. Some were game designers. Some were just curious."
- GOOD: Use two items, four or more, or vary lengths significantly so the 1-2-3 cadence breaks.
Zero instances per post.

**RULE 3: Zero echo-line poetics.**
Never restate the same idea in slightly different words on consecutive lines.
- BANNED: "That's the actual magic. That's when you know you've built something real."
Say it once, with specifics. Trust single statements to carry weight.

**RULE 4: Zero grand summative statements.**
- BANNED: "That's what this milestone actually means." / "And that changes everything." / "That's the whole thing, right there."
End on a specific detail or a concrete next step, not a pronouncement.

**RULE 5: Zero present-participle trailing clauses.**
Never tack ", [verb]-ing [consequence]" onto sentences.
- BANNED: "...demonstrating the power of community." / "...reflecting a shift in how people work."
Make it its own sentence or cut it entirely.

**RULE 6: Zero em-dashes.**
Use commas, full stops, parentheses, or colons instead. Zero em-dashes anywhere including hooks.

**RULE 7: Zero company pitching. The post sells the IDEA, never the company.**
The post must read as ${posterName} sharing a genuine insight, story, or lesson. The company and its product should be incidental background, not the point.${
    hasSourceUrls
      ? " The goal is to make the reader so curious about the idea that they click the link to the source material on their own. Through reading the blog post, they discover the company organically. Think of it as a trap they walk into willingly because the idea hooked them, not because they were pitched."
      : " The post should stand on its own as a valuable piece of thinking. The reader should walk away having learned something or seen a problem differently, without needing to click through anywhere."
  }
- BANNED: Naming the company's product as the hero or solution
- BANNED: "We built X and it does Y" framing (product-launch tone)
- BANNED: Any sentence whose primary purpose is to make the company look good
- BANNED: Feature lists, capability descriptions, or anything resembling marketing copy
- GOOD: Share the problem, the surprise, the counterintuitive finding. Let the reader think "I need to read more about this."
- GOOD: The company/product only appears as a natural part of telling the story ("while we were rebuilding our pipeline..." not "our product can rebuild your pipeline")
- If the source material is promotional, extract the underlying insight or story and lead with THAT. Strip the sales wrapper entirely.

### ${buildAntiAIVocabBlock()}

${resolvedStyle}

## STEP 4: SELF-EDIT PROTOCOL (MANDATORY before presenting output)

After writing each body, scan line by line and FIX any violations:

1. "Didn't X / Did Y" scan: any negative-positive restatement? Rewrite as direct positive statement. Target: ZERO.
2. Triple-beat scan: three parallel fragments or items? Combine into one flowing sentence. Target: ZERO.
3. Echo-line scan: does a line say the same thing as the previous line in different words? Delete one. Target: ZERO.
4. Summative statement scan: does a line announce what the post means? Replace with specific detail or cut. Target: ZERO.
5. Trailing participle scan: any ", [verb]-ing [significance]" clause? Rewrite as own sentence or cut. Target: ZERO.
6. Em-dash scan: replace every single one with comma, full stop, colon, or parenthesis. Target: ZERO.
7. Interchangeability test: could this sentence appear unchanged in a different post about a different company? Rewrite with details specific to THIS story.
8. Sentence length distribution: scan each paragraph. If three consecutive sentences are similar in length, break the pattern.
9. Third-person scan: does any sentence refer to ${posterName} or their company as "they", "the team", or by name in the third person? Rewrite in first person ("I" / "we"). The poster IS the author. Target: ZERO third-person self-references.
10. Sales pitch scan: does any sentence exist primarily to make the company or product look good? Would a reader think "this is an ad" if they read it? Rewrite to focus on the insight, story, or lesson instead. Strip any sentence that reads like marketing copy. Target: ZERO promotional sentences.
11. Body B focus scan: read Body B and identify the single core insight. Does every sentence either (a) set up that insight through a specific moment, or (b) deliver that insight? If a sentence does neither, cut it. Check word count: if over 250 words, remove the least essential sentences from the middle until it is under 250.${
    !hasSourceUrls
      ? `
12. Fabricated link scan: the source material contains NO URLs. Check both bodies for any URLs, "link in comments", "read more here", or references to a linked article. Remove them all. The post must stand entirely on its own. Target: ZERO links or link references.`
      : ""
  }

Do not present output that violates rules 1-7. These are hard failures.

## STEP 5: HUMANIZATION PASS (mandatory for Body B, strongly recommended for Body A)

After the self-edit:
${buildHumanisationPassBlock()}
6. Body B length recheck: humanization must not re-inflate Body B. If adding texture pushes it over 250 words, swap rather than add (replace a weaker sentence with the more human one). The word ceiling is non-negotiable.

## OUTPUT FORMAT

Present your output in exactly this structure:

## HOOK 1
[Hook 1 text]

## HOOK 2
[Hook 2 text]

## HOOK 3
[Hook 3 text]

---

## BODY A — LinkedIn Optimised

[Hook + body text with short paragraphs and white space]

[CTA]

[#hashtag1 #hashtag2 #hashtag3]

---

## BODY B — Humanised

[Hook + body text, more flowing and authentic]

[Optional soft CTA or none]

---

## NOTES

- **Recommended hook**: [Which hook to lead with and why, in one sentence]
- **Visual suggestion**: [What kind of image would pair well with this post]
- **Omitted elements**: [Any elements from the source material you deliberately left out and why]`;
}

export const linkedinPostGeneratorTask = task({
  id: "linkedin-post-generator",
  maxDuration: 1800,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: LinkedInPostGeneratorPayload, { signal }) => {
    const {
      runId,
      posterName,
      posterRole,
      sourceMaterial,
      voiceContext,
      linkedinUrl,
      useLinkedinProfile,
      model,
      accountName,
      promptStyle,
      customPrompt,
    } = payload;

    try {
      const hasLinkedinScrape = useLinkedinProfile && linkedinUrl;
      const totalSteps = hasLinkedinScrape ? 4 : 3;
      metadata.set("progress", {
        step: hasLinkedinScrape ? "Scraping LinkedIn profile" : "Preparing source material",
        stepNumber: 1,
        totalSteps,
        percentage: 5,
      });

      const resolvedModel = resolveModel(model, MODEL_MAP.sonnet);
      logger.info("Starting LinkedIn post generator", {
        runId,
        posterName,
        model: resolvedModel,
        promptStyle: customPrompt?.trim() ? "custom" : promptStyle || "default",
        hasLinkedinUrl: !!linkedinUrl,
        useLinkedinProfile: !!useLinkedinProfile,
        hasVoiceContext: !!voiceContext,
      });

      const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);
      await mkdir(sessionDir, { recursive: true });

      await writeFile(join(sessionDir, "source-material.txt"), sourceMaterial, "utf-8");
      const sourceUrls = extractUrls(sourceMaterial);
      if (sourceUrls.length > 0) {
        await writeFile(join(sessionDir, "source-urls.txt"), sourceUrls.join("\n"), "utf-8");
      }

      if (voiceContext) {
        await writeFile(join(sessionDir, "voice-context.txt"), voiceContext, "utf-8");
      }

      let hasScrapedData = false;
      if (useLinkedinProfile && linkedinUrl) {
        logger.info("Scraping LinkedIn profile via Apify", {
          runId,
          linkedinUrl,
        });
        const scrapeStart = Date.now();
        try {
          const scrapedData = await scrapeLinkedInProfile(linkedinUrl, signal);
          await writeFile(
            join(sessionDir, "scraped-profile.json"),
            JSON.stringify(scrapedData.profileData, null, 2),
            "utf-8"
          );
          await writeFile(
            join(sessionDir, "scraped-posts.json"),
            JSON.stringify(scrapedData.postsData, null, 2),
            "utf-8"
          );
          hasScrapedData = true;
          const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
          logger.info(`Scrape finished in ${scrapeElapsed}s`, {
            slug: scrapedData.slug,
          });
        } catch (scrapeErr) {
          const msg = scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
          logger.warn(`LinkedIn scrape failed, continuing without profile data: ${msg}`);
        }
      }

      const prompt = buildPrompt(
        posterName,
        posterRole,
        hasScrapedData,
        !!voiceContext,
        sourceUrls,
        promptStyle,
        customPrompt
      );

      const genStep = hasLinkedinScrape ? 2 : 1;
      metadata.set("progress", {
        step: "Generating posts",
        stepNumber: genStep,
        totalSteps,
        percentage: hasLinkedinScrape ? 30 : 15,
      });
      logger.info("Starting Claude Agent SDK", { model: resolvedModel });
      const claudeStart = Date.now();
      let output = "";

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      for await (const message of query({
        prompt,
        options: {
          model: resolvedModel,
          abortController,
          cwd: sessionDir,
          allowedTools: ["Read", "WebFetch"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 40,
          persistSession: false,
        },
      })) {
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

      const claudeElapsed = ((Date.now() - claudeStart) / 1000).toFixed(1);
      logger.info(`Claude finished in ${claudeElapsed}s (output: ${output.length} chars)`);

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

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

      const filename = `MVRX | ${posterName} | LinkedIn Posts`;
      const driveFile = await createGoogleDoc(filename, output, targetFolderId);
      logger.info(`Google Doc created: ${driveFile.webViewLink}`);

      metadata.set("progress", {
        step: "Complete",
        stepNumber: totalSteps,
        totalSteps,
        percentage: 100,
      });

      const outputMessage = `Posts document saved: ${filename}`;
      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: outputMessage,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("Post generator completed", {
        runId,
        outputLength: output.length,
        driveUrl: driveFile.webViewLink,
      });

      return { success: true, filename, driveUrl: driveFile.webViewLink };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Post generator failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "linkedin-post-generator",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
