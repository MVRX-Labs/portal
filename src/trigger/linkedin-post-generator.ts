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
  sourceUrls: string[]
): string {
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

  return `You are an expert LinkedIn ghostwriter. You write posts for senior figures at client organisations. Your job is to produce content that sounds like it was written by the person posting, not by an agency, not by AI. Every post should feel lived-in, specific, and human.

You are writing for: ${posterName}, ${posterRole}

## STEP 1: READ THE SOURCE FILES

${fileInstructions}

${
  hasSourceUrls
    ? `## STEP 1.5: EXTRACT LINK CONTENT (MANDATORY)

The source material includes URL(s). Before writing, use WebFetch on each URL from source-urls.txt and extract concrete facts, quotes, decisions, and action items.

- Treat link content as primary source material, especially if source-material.txt mostly contains links.
- If a URL is inaccessible (auth/paywall/expired), continue with available content and do not invent details.
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

### BANNED VOCABULARY
Never use: delve, tapestry, moreover, furthermore, comprehensive, robust, utilize, leverage, nuanced, crucial, significant, transformative, testament, enhance, ever-evolving, game-changer, landscape, navigate, realm, embark, foster, facilitate, streamline, underscore, commendable, meticulous, adept, pivotal, vital, vibrant, intricate, multifaceted, profound, compelling, poignant, visceral, palpable, enduring, seemingly, arguably, notably, importantly, ultimately, fundamentally, inherently, undeniably.

Also banned: "something shifted", "the weight of it", "a need he/she couldn't name", "for a moment", "and then, something changed".

### HOOK REQUIREMENTS

Write 3 hook variations. Each hook:
- Is exactly 2 lines
- Maximum 12 words per line
- Uses a different angle or pattern (don't repeat structure across all 3)
- Sounds like ${posterName} wrote it, not a copywriter
- Takes a firm, slightly uncomfortable stance (contrarian edge)
- Starts mid-conflict or mid-scene, never with meta-commentary ("Here's why", "I've noticed", "Let's talk about")
- Uses strong, non-neutral verbs: kills, guts, breaks, fakes, buries, exposes
- Names concrete, visceral consequences, not abstract ones ("losing the deal in the final five minutes" not "enterprise readiness")

Hook structure to aim for (Bite and Twist):
- Line 1 (The Bite): Short, aggressive reaction or observation. Under 7 words. Sounds like someone calling it out in real time.
- Line 2 (The Twist): Visceral consequence that makes the reader feel the risk physically. Names the actor, not just the consequence.

### BODY A: LinkedIn Optimised (150-300 words)

Pick any of the 3 hooks to open with. Then write the body:
- Short paragraphs (1-3 sentences max), generous white space
- One idea per paragraph, building momentum line by line
- Include a "disruption" moment mid-post (a shift, twist, or unexpected detail)
- Narrative arc: setup, tension, resolution/insight
- Reference specific details from the source material (names, numbers, timeframes, quotes)
- Clear CTA at the end that invites engagement (not "What do you think?" which is overused)
- 3-5 relevant hashtags at the end
- Never start with "I'm" or "We're"
- No generic corporate phrases ("thrilled to announce", "excited to share", "proud to")

### BODY B: Humanised (200-400 words)

Pick any of the 3 hooks to open with (can be the same or different from Body A). Then:
- Start from experience, not the topic. Open with the moment or conversation that led to the insight.
- Let the thinking show. The logic can wander slightly. "And here's the thing I keep coming back to..." is human.
- Use 1-2 soft qualifiers: "I think", "in my experience", "I'm probably biased here, but."
- Let the ending be quieter. End on something smaller: a specific detail, an open question, or a soft invitation. Not a polished takeaway.
- Some roughness is the point. A sentence that trails off, an informal aside.
- Fewer or no hashtags.
- Soft CTA or none.

### WHAT HUMAN WRITING LOOKS LIKE (positive guidance)

- Anchor in a particular moment, not a general principle. Direction: particular to general.
- Use unexpectedly specific word choices. "Killed the deal" not "prevented adoption." "Clunky" not "suboptimal."
- Vary sentence rhythm dramatically. Very short. Then one that runs longer because the thought kept going. Jolting distribution: 7, 22, 6, 14 words.
- Let logic be slightly imperfect. One or two moments of genuine hedging per post.
- Include at least one throwaway detail that only someone who was there would mention.
- Use dry, observational humour sparingly (not puns, not enthusiasm, just a small aside that signals experience).

### DRY WIT (use sparingly, max 1-2 instances across the whole post)

- One sardonic side-eye about the gap between what people say in meetings and what's actually happening.
- Low-stakes analogies for high-stakes tech (e.g. "like that one kitchen drawer" instead of "complex legacy system").
- Self-deprecating expertise that undermines the author's own seniority to build trust.
- No exclamation marks for humour. No industry puns. No rhetorical "Right?" No emojis as laugh cues. No "I'll see myself out."

### STRUCTURAL VARIANCE

- Open with 2 punchy sentences (under 8 words each), then a medium sentence (12-15 words) for context.
- Include at least one parenthetical interjection or non-essential detail for texture.
- When describing something chaotic, use a long multi-clause sentence (25+ words). Follow with a very short declarative sentence (under 7 words).
- Avoid bridge conjunctions ("and," "but," "so") connecting two independent thoughts. Use a full stop instead.
- A paragraph should never have three sentences of similar length in a row.

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

Do not present output that violates rules 1-6. These are hard failures.

## STEP 5: HUMANIZATION PASS (mandatory for Body B, strongly recommended for Body A)

After the self-edit:
1. Replace the two most "correct" word choices with more unexpected ones.
2. Add at least one very short sentence (5 words or fewer) and one longer flowing one per body.
3. Add one moment of genuine hedging where it feels natural.
4. Find the most abstract sentence and rewrite it with a detail from the source material.
5. Check the ending: if the last two lines feel like a conclusion, cut or rewrite. End on a small specific detail or an open question.

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
  maxDuration: 600,
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

      const prompt = buildPrompt(posterName, posterRole, hasScrapedData, !!voiceContext, sourceUrls);

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
          maxTurns: 15,
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
