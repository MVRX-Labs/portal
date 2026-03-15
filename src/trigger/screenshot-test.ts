import { task, logger } from "@trigger.dev/sdk/v3";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { Document, Packer, Paragraph } from "docx";
import { takeScreenshots } from "@/lib/growth-report/take-screenshots";
import { evaluateScreenshots } from "@/lib/growth-report/screenshots";
import { screenshotBlock, tr, SZ, C } from "@/lib/growth-report/styles";
import { uploadFile, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { sendSlackNotification } from "@/lib/slack";

interface ScreenshotTestPayload {
  urls: string[];
  /** Skip Claude evaluation and just return raw screenshots */
  skipEvaluation?: boolean;
}

/**
 * Standalone task for testing screenshot capture independently.
 * Takes a list of URLs, captures screenshots with Playwright,
 * optionally evaluates them with Claude, builds a DOCX with the
 * screenshots embedded, and uploads it to Google Drive.
 *
 * Trigger via dashboard or API:
 *   { "urls": ["https://example.com", "https://example.org"] }
 */
export const screenshotTestTask = task({
  id: "screenshot-test",
  retry: { maxAttempts: 1 },
  run: async (payload: ScreenshotTestPayload) => {
    const { urls, skipEvaluation = false } = payload;

    if (!urls?.length) {
      throw new Error("No URLs provided");
    }

    logger.info(`Screenshot test: ${urls.length} URLs, evaluation=${!skipEvaluation}`);

    const sessionDir = join(tmpdir(), `screenshot-test-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });

    // Build screenshot targets
    const targets = urls.map((url) => ({
      url,
      context: `Test screenshot of ${url}`,
      section: "executiveSummary" as const,
    }));

    // Capture screenshots with Playwright
    const captured = await takeScreenshots(targets);

    // Optionally evaluate with Claude (generates captions)
    let captions: Map<string, string> = new Map();
    if (!skipEvaluation && captured.length > 0) {
      const approved = await evaluateScreenshots(captured, "Screenshot Test", sessionDir);
      for (const a of approved) {
        captions.set(a.url, a.caption);
      }
    }

    // Build DOCX with all screenshots
    const body: Paragraph[] = [
      new Paragraph({
        spacing: { after: 300 },
        children: [tr("Screenshot Test Results", { bold: true, size: SZ.sectionH, color: C.brand })],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          tr(`${captured.length}/${urls.length} screenshots captured  |  ${new Date().toLocaleString("en-GB")}`, {
            size: SZ.body,
            color: C.gray,
          }),
        ],
      }),
    ];

    for (const s of captured) {
      const caption = captions.get(s.url) || s.url;
      const sizeKB = Math.round(s.buffer.length / 1024);

      // URL header
      body.push(
        new Paragraph({
          spacing: { before: 300, after: 100 },
          children: [tr(s.url, { bold: true, size: SZ.subH, color: C.dark })],
        })
      );

      // Size/dimensions info
      body.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [tr(`${s.width}x${s.height}  |  ${sizeKB} KB`, { size: SZ.dataSrc, color: C.gray })],
        })
      );

      // The screenshot itself
      body.push(...screenshotBlock(s.buffer, caption, s.width, s.height));
    }

    // Add failed URLs
    const failedUrls = urls.filter((url) => !captured.some((s) => s.url === url));
    if (failedUrls.length > 0) {
      body.push(
        new Paragraph({
          spacing: { before: 400, after: 200 },
          children: [tr("Failed URLs", { bold: true, size: SZ.subH, color: C.dark })],
        })
      );
      for (const url of failedUrls) {
        body.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [tr(`- ${url}`, { size: SZ.body, color: C.gray })],
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children: body,
        },
      ],
    });

    const docxBuffer = Buffer.from(await Packer.toBuffer(doc));
    const filename = `Screenshot Test - ${new Date().toISOString().slice(0, 16).replace("T", " ")}.docx`;

    // Upload to Google Drive
    const parentFolder = getGeneratedMaterialsFolderId();
    const driveFile = await uploadFile(
      filename,
      docxBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      parentFolder
    );

    logger.info("Uploaded DOCX to Google Drive", {
      filename,
      webViewLink: driveFile.webViewLink,
      screenshots: captured.length,
    });

    return {
      driveUrl: driveFile.webViewLink,
      filename,
      summary: {
        requested: urls.length,
        captured: captured.length,
        failed: urls.length - captured.length,
        avgSizeKB: Math.round(captured.reduce((sum, s) => sum + s.buffer.length, 0) / captured.length / 1024),
        maxSizeKB: Math.round(Math.max(...captured.map((s) => s.buffer.length)) / 1024),
      },
    };
  },
  onFailure: async ({ error }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await sendSlackNotification({
      tool: "screenshot-test",
      userName: "trigger-task",
      error: errorMessage,
      runId: "n/a",
    });
  },
});
