import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@trigger.dev/sdk/v3";
import sizeOf from "image-size";
import sharp from "sharp";
import { MODEL_MAP } from "../audit-utils";
import type { RawScreenshot } from "./scrapers";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB Claude limit

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

/**
 * Shrink a PNG buffer until it's under the Claude 5 MB limit.
 * Progressively reduces dimensions by 25% each pass.
 */
async function shrinkToLimit(buf: Buffer, url: string): Promise<Buffer> {
  if (buf.length <= MAX_IMAGE_BYTES) return buf;

  const meta = await sharp(buf).metadata();
  let width = meta.width ?? 1280;
  let result = buf;

  while (result.length > MAX_IMAGE_BYTES && width > 400) {
    width = Math.round(width * 0.75);
    result = await sharp(buf).resize({ width }).png({ quality: 80 }).toBuffer();
    logger.info(`Resized screenshot for ${url}: width=${width}, size=${result.length} bytes`);
  }

  if (result.length > MAX_IMAGE_BYTES) {
    // Last resort: convert to JPEG
    result = await sharp(buf).resize({ width }).jpeg({ quality: 70 }).toBuffer();
    logger.info(`Converted screenshot to JPEG for ${url}: size=${result.length} bytes`);
  }

  return result;
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

  // Download all screenshot images in parallel, shrinking any that exceed 5 MB
  const downloads = await Promise.allSettled(
    screenshots.map(async (s) => {
      logger.info(`Downloading screenshot from ${s.screenshotUrl}`);
      const res = await fetch(s.screenshotUrl);
      if (!res.ok) throw new Error(`Download failed for ${s.url}: ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      logger.info(`Downloaded screenshot for ${s.url}: ${buf.length} bytes`);
      if (buf.length > MAX_IMAGE_BYTES) {
        logger.warn(`Screenshot for ${s.url} exceeds 5 MB (${buf.length} bytes), resizing`);
        return await shrinkToLimit(buf, s.url);
      }
      return buf;
    })
  );

  // Filter to successfully downloaded screenshots
  const downloaded: Array<{ index: number; screenshot: RawScreenshot; buffer: Buffer }> = [];
  downloads.forEach((result, i) => {
    if (result.status !== "fulfilled") {
      logger.warn(`Screenshot download failed for ${screenshots[i].url}`, {
        error: result.reason?.message,
      });
      return;
    }
    downloaded.push({ index: i, screenshot: screenshots[i], buffer: result.value });
  });

  const downloadsFailed = downloads.length - downloaded.length;
  logger.info(`Screenshot downloads: ${downloaded.length} succeeded, ${downloadsFailed} failed`);

  if (downloaded.length === 0) {
    logger.warn("All screenshot downloads failed — skipping evaluation");
    return [];
  }

  // Evaluate each screenshot individually so one failure doesn't block the rest
  logger.info(`Evaluating ${downloaded.length} screenshots individually via Claude`);

  const evalResults = await Promise.allSettled(
    downloaded.map(async ({ screenshot, buffer }) => {
      const response = await anthropic.messages.create({
        model: MODEL_MAP.sonnet,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Screenshot: ${screenshot.url}\nContext: ${screenshot.context}\nTarget section: ${screenshot.section}`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: buffer.toString("base64"),
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

  for (let i = 0; i < downloaded.length; i++) {
    const { screenshot, buffer } = downloaded[i];
    const evalResult = evalResults[i];

    let include = true;
    let caption = `Screenshot of ${screenshot.context}`;
    let reason = "default";

    if (evalResult.status === "fulfilled") {
      include = evalResult.value.include;
      caption = evalResult.value.caption || caption;
      reason = evalResult.value.reason;
    } else {
      const errMsg = evalResult.reason instanceof Error ? evalResult.reason.message : String(evalResult.reason);
      logger.error(`Claude evaluation failed for ${screenshot.url} — including with generic caption`, {
        error: errMsg,
      });
      reason = "Evaluation API failed — included by default";
    }

    if (!include) {
      logger.info(`Screenshot excluded: ${screenshot.url} — ${reason}`);
      continue;
    }

    const filename = `screenshot-${approved.length}.png`;
    await writeFile(join(sessionDir, filename), buffer);

    const dimensions = sizeOf(buffer);
    approved.push({
      url: screenshot.url,
      section: screenshot.section,
      context: screenshot.context,
      caption,
      filename,
      width: dimensions.width ?? 1280,
      height: dimensions.height ?? 800,
    });

    logger.info(`Screenshot approved: ${screenshot.url} → ${filename}`);
  }

  const excludedCount = downloaded.length - approved.length;
  logger.info(`Screenshot evaluation complete: ${approved.length} approved, ${excludedCount} excluded`);

  return approved;
}
