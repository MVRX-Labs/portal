import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@trigger.dev/sdk/v3";
import sizeOf from "image-size";
import { MODEL_MAP } from "../audit-utils";
import type { RawScreenshot } from "./scrapers";

const anthropic = new Anthropic();

export interface ApprovedScreenshot {
  url: string;
  section: string;
  context: string;
  caption: string;
  filename: string;
  width: number;
  height: number;
}

interface EvalResult {
  index: number;
  include: boolean;
  reason: string;
  caption: string;
}

/**
 * Download screenshot PNGs from Apify KV store URLs, send them to Claude
 * for multimodal evaluation, save approved ones to the session directory.
 */
export async function evaluateScreenshots(
  screenshots: RawScreenshot[],
  companyName: string,
  sessionDir: string
): Promise<ApprovedScreenshot[]> {
  if (screenshots.length === 0) return [];

  // Download all screenshot images in parallel
  const downloads = await Promise.allSettled(
    screenshots.map(async (s) => {
      logger.info(`Downloading screenshot from ${s.screenshotUrl}`);
      const res = await fetch(s.screenshotUrl);
      if (!res.ok) throw new Error(`Download failed for ${s.url}: ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      logger.info(`Downloaded screenshot for ${s.url}: ${buf.length} bytes`);
      return buf;
    })
  );

  // Build the multimodal message — all images in one call for efficiency
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  const validIndices: number[] = [];

  downloads.forEach((result, i) => {
    if (result.status !== "fulfilled") {
      logger.warn(`Screenshot download failed for ${screenshots[i].url}`, {
        error: result.reason?.message,
      });
      return;
    }

    validIndices.push(i);
    contentBlocks.push({
      type: "text",
      text: `Screenshot ${i + 1}: ${screenshots[i].url}\nContext: ${screenshots[i].context}\nTarget section: ${screenshots[i].section}`,
    });
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: result.value.toString("base64"),
      },
    });
  });

  const downloadsFailed = downloads.filter((r) => r.status === "rejected").length;
  logger.info(`Screenshot downloads: ${validIndices.length} succeeded, ${downloadsFailed} failed`);

  if (validIndices.length === 0) {
    logger.warn("All screenshot downloads failed — skipping evaluation");
    return [];
  }

  contentBlocks.push({
    type: "text",
    text: `You are evaluating ${validIndices.length} screenshots for inclusion in a professional SEO & Growth Strategy Report for "${companyName}".

For each screenshot, decide whether to INCLUDE or EXCLUDE it.

EXCLUDE a screenshot only if it is clearly broken:
- The page failed to render (blank white/grey page, browser error)
- The screenshot was captured mid-JavaScript-rendering so the content is incomplete or garbled
- The image is corrupted or unreadable
- The page shows a generic server error (500, 503, etc.)

INCLUDE screenshots even if they show cookie banners, login pages, consent walls, popups, or unexpected content — these can be valuable observations in the report. Write the caption to describe what is actually visible, including any notable issues.

Return a JSON array with one entry per screenshot (in order):
[
  { "index": 1, "include": true, "reason": "Page rendered correctly", "caption": "A one-sentence professional caption describing what the screenshot shows" },
  { "index": 2, "include": false, "reason": "Page is blank — JavaScript failed to render", "caption": "" }
]

CRITICAL: Return ONLY the raw JSON array. No markdown fences, no explanation.`,
  });

  logger.info(`Sending ${validIndices.length} screenshots to Claude for evaluation`);

  const response = await anthropic.messages.create({
    model: MODEL_MAP.sonnet,
    max_tokens: 4096,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const responseText = response.content[0].type === "text" ? response.content[0].text : "";
  logger.info("Screenshot evaluation response received", { length: responseText.length });

  let evaluations: EvalResult[];
  try {
    evaluations = JSON.parse(responseText);
  } catch {
    logger.warn("Failed to parse screenshot evaluation response, including all screenshots", {
      responsePreview: responseText.slice(0, 500),
    });
    // Fallback: include all with generic captions
    evaluations = validIndices.map((_, i) => ({
      index: i + 1,
      include: true,
      reason: "Evaluation parse failed — included by default",
      caption: `Screenshot of ${screenshots[validIndices[i]].context}`,
    }));
  }

  // Save approved screenshots and build metadata
  const approved: ApprovedScreenshot[] = [];

  for (let evalIdx = 0; evalIdx < evaluations.length; evalIdx++) {
    const eval_ = evaluations[evalIdx];
    const sourceIdx = validIndices[evalIdx];
    if (sourceIdx === undefined) continue;

    const screenshot = screenshots[sourceIdx];
    const downloadResult = downloads[sourceIdx];
    if (downloadResult.status !== "fulfilled") continue;

    if (!eval_.include) {
      logger.info(`Screenshot excluded: ${screenshot.url} — ${eval_.reason}`);
      continue;
    }

    const buffer = downloadResult.value;
    const filename = `screenshot-${approved.length}.png`;
    await writeFile(join(sessionDir, filename), buffer);

    const dimensions = sizeOf(buffer);
    approved.push({
      url: screenshot.url,
      section: screenshot.section,
      context: screenshot.context,
      caption: eval_.caption,
      filename,
      width: dimensions.width ?? 1280,
      height: dimensions.height ?? 800,
    });

    logger.info(`Screenshot approved: ${screenshot.url} → ${filename}`);
  }

  const excluded = evaluations.filter((e) => !e.include);
  logger.info(`Screenshot evaluation complete: ${approved.length} approved, ${excluded.length} excluded`, {
    excluded: excluded.map((e, i) => ({
      url: screenshots[validIndices[i]]?.url,
      reason: e.reason,
    })),
  });

  return approved;
}
