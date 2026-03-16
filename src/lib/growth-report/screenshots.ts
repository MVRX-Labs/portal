import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@trigger.dev/sdk/v3";
import { MODEL_MAP } from "../audit-utils";
import type { CapturedScreenshot } from "./take-screenshots";
import type { GrowthReportContent } from "./schema";

const anthropic = new Anthropic();

/** Detect media type from buffer header (JPEG starts with FF D8) */
function mediaType(buf: Buffer): "image/jpeg" | "image/png" {
  return buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/png";
}

export interface ApprovedScreenshot {
  url: string;
  section: string;
  context: string;
  caption: string;
  filename: string;
  width: number;
  height: number;
}

/**
 * Evaluate captured screenshots with Claude, save approved ones to session dir.
 * Accepts pre-captured buffers from Playwright (no downloading needed).
 */
export async function evaluateScreenshots(
  screenshots: CapturedScreenshot[],
  companyName: string,
  sessionDir: string
): Promise<ApprovedScreenshot[]> {
  if (screenshots.length === 0) return [];

  logger.info(`Evaluating ${screenshots.length} screenshots individually via Claude`);

  const evalResults = await Promise.allSettled(
    screenshots.map(async (s) => {
      const response = await anthropic.messages.create({
        model: MODEL_MAP.sonnet,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Screenshot: ${s.url}\nContext: ${s.context}\nTarget section: ${s.section}`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType(s.buffer),
                  data: s.buffer.toString("base64"),
                },
              },
              {
                type: "text",
                text: `You are evaluating this screenshot for inclusion in a professional SEO & Growth Strategy Report for "${companyName}".

Decide whether to INCLUDE or EXCLUDE it.

EXCLUDE only if it is clearly broken:
- The page failed to render (blank white/grey page, browser error)
- The screenshot was captured mid-JavaScript-rendering so the content is incomplete or garbled
- The image is corrupted or unreadable
- The page shows a generic server error (500, 503, etc.)

INCLUDE even if it shows cookie banners, login pages, consent walls, popups, or unexpected content — these can be valuable observations in the report.

Return a single JSON object:
{ "include": true, "reason": "Page rendered correctly", "caption": "A one-sentence professional caption describing what the screenshot shows" }

CRITICAL: Return ONLY the raw JSON object. No markdown fences, no explanation.`,
              },
            ],
          },
        ],
      });

      const responseText = response.content[0].type === "text" ? response.content[0].text : "";
      return JSON.parse(responseText) as { include: boolean; reason: string; caption: string };
    })
  );

  // Save approved screenshots and build metadata
  const approved: ApprovedScreenshot[] = [];

  for (let i = 0; i < screenshots.length; i++) {
    const s = screenshots[i];
    const evalResult = evalResults[i];

    let include = true;
    let caption = `Screenshot of ${s.context}`;
    let reason = "default";

    if (evalResult.status === "fulfilled") {
      include = evalResult.value.include;
      caption = evalResult.value.caption || caption;
      reason = evalResult.value.reason;
    } else {
      const errMsg = evalResult.reason instanceof Error ? evalResult.reason.message : String(evalResult.reason);
      logger.error(`Claude evaluation failed for ${s.url} — including with generic caption`, {
        error: errMsg,
      });
      reason = "Evaluation API failed — included by default";
    }

    if (!include) {
      logger.info(`Screenshot excluded: ${s.url} — ${reason}`);
      continue;
    }

    const ext = mediaType(s.buffer) === "image/jpeg" ? "jpg" : "png";
    const filename = `screenshot-${approved.length}.${ext}`;
    await writeFile(join(sessionDir, filename), s.buffer);

    approved.push({
      url: s.url,
      section: s.section,
      context: s.context,
      caption,
      filename,
      width: s.width,
      height: s.height,
    });

    logger.info(`Screenshot approved: ${s.url} → ${filename}`);
  }

  const excludedCount = screenshots.length - approved.length;
  logger.info(`Screenshot evaluation complete: ${approved.length} approved, ${excludedCount} excluded`);

  return approved;
}

/**
 * Extract the key text from a report section (findings, overview, etc.)
 * to give context for re-captioning screenshots.
 */
function extractSectionText(content: GrowthReportContent, sectionName: string): string | null {
  const section = content[sectionName as keyof GrowthReportContent];
  if (!section || typeof section !== "object") return null;

  const parts: string[] = [];
  const s = section as Record<string, unknown>;

  // Most sections have findings
  if (Array.isArray(s.findings)) parts.push(...(s.findings as string[]));
  // Executive summary
  if (typeof s.overview === "string") parts.push(s.overview);
  if (typeof s.keyConclusion === "string") parts.push(s.keyConclusion);
  // Some sections have recommendations
  if (Array.isArray(s.recommendations)) parts.push(...(s.recommendations as string[]));
  // Reddit/social have coreProblem
  if (typeof s.coreProblem === "string") parts.push(s.coreProblem);

  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Re-caption screenshots using the actual report section text for context.
 * Sends each screenshot + its section's commentary to Claude to generate
 * a caption that ties the image to the surrounding analysis.
 * Screenshots that don't add value to their section are omitted.
 *
 * Returns the updated screenshots array (with new captions, minus omitted ones).
 */
export async function recaptionScreenshots(
  screenshots: ApprovedScreenshot[],
  content: GrowthReportContent,
  sessionDir: string
): Promise<ApprovedScreenshot[]> {
  if (screenshots.length === 0) return [];

  logger.info(`Re-captioning ${screenshots.length} screenshots with section context`);

  const results = await Promise.allSettled(
    screenshots.map(async (s) => {
      const sectionText = extractSectionText(content, s.section);

      if (!sectionText) {
        logger.info(`No section text for "${s.section}" — keeping original caption for ${s.url}`);
        return { ...s, keep: true };
      }

      const buf = await readFile(join(sessionDir, s.filename));

      const response = await anthropic.messages.create({
        model: MODEL_MAP.sonnet,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are writing a caption for a screenshot in a professional SEO & Growth Strategy Report.

The screenshot appears in the "${s.section}" section. Here is the surrounding analysis text from that section:

---
${sectionText}
---

The screenshot is of: ${s.url}
Original context: ${s.context}`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType(buf),
                  data: buf.toString("base64"),
                },
              },
              {
                type: "text",
                text: `Write a 1-sentence caption that ties what is visible in the screenshot to the analysis above. The caption should help the reader understand WHY this screenshot is included — what it illustrates or evidences from the analysis.

If the screenshot does NOT meaningfully relate to the section analysis (e.g. it's a generic page that doesn't illustrate any of the findings), respond with OMIT instead.

Return a single JSON object:
{ "keep": true, "caption": "The caption text" }
or
{ "keep": false, "reason": "Why it doesn't fit" }

CRITICAL: Return ONLY the raw JSON object. No markdown fences, no explanation.`,
              },
            ],
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      return JSON.parse(text) as { keep: boolean; caption?: string; reason?: string };
    })
  );

  const recaptioned: ApprovedScreenshot[] = [];

  for (let i = 0; i < screenshots.length; i++) {
    const s = screenshots[i];
    const result = results[i];

    if (result.status !== "fulfilled") {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.warn(`Re-captioning failed for ${s.url} — keeping original caption`, { error: errMsg });
      recaptioned.push(s);
      continue;
    }

    const { keep, caption, reason } = result.value;

    if (!keep) {
      logger.info(`Screenshot omitted during re-captioning: ${s.url} — ${reason}`);
      continue;
    }

    recaptioned.push({
      ...s,
      caption: caption || s.caption,
    });

    logger.info(`Re-captioned: ${s.url} → "${caption}"`);
  }

  const omitted = screenshots.length - recaptioned.length;
  if (omitted > 0) {
    logger.info(`Re-captioning: ${recaptioned.length} kept, ${omitted} omitted`);
  }

  return recaptioned;
}
