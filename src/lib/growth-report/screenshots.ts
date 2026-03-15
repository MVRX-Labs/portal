import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@trigger.dev/sdk/v3";
import { MODEL_MAP } from "../audit-utils";
import type { CapturedScreenshot } from "./take-screenshots";

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

  // Detect media type from buffer header (JPEG starts with FF D8)
  function mediaType(buf: Buffer): "image/jpeg" | "image/png" {
    return buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/png";
  }

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
