import { chromium, type Page } from "playwright";
import { logger } from "@trigger.dev/sdk/v3";
import sharp from "sharp";
import type { ScreenshotTarget } from "./discovery";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB Claude limit
const TARGET_WIDTH = 1280; // Final image width
const DEVICE_SCALE = 2; // Retina capture for crisp text

export interface CapturedScreenshot extends ScreenshotTarget {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Capture a single page screenshot with Playwright.
 * Uses 2x device scale for crisp text, then downscales to TARGET_WIDTH
 * and compresses to JPEG to stay well under the 5 MB limit.
 */
async function capturePage(page: Page, target: ScreenshotTarget): Promise<CapturedScreenshot> {
  logger.info(`Navigating to ${target.url}`);

  await page.goto(target.url, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Extra wait for lazy-loaded content and animations
  await page.waitForTimeout(2000);

  // Dismiss common overlays: cookie banners, popups
  await dismissOverlays(page);

  // Capture at 2x for sharp text
  const rawPng = await page.screenshot({ type: "png", fullPage: false });
  logger.info(`Raw screenshot for ${target.url}: ${rawPng.length} bytes`);

  // Downscale to target width and convert to JPEG for size control
  const optimized = await optimizeScreenshot(Buffer.from(rawPng), target.url);

  const metadata = await sharp(optimized).metadata();
  const width = metadata.width ?? TARGET_WIDTH;
  const height = metadata.height ?? 800;

  if (optimized.length > MAX_IMAGE_BYTES) {
    throw new Error(`Screenshot for ${target.url} still exceeds 5 MB after optimization (${optimized.length} bytes)`);
  }

  logger.info(`Optimized screenshot for ${target.url}: ${optimized.length} bytes (${width}x${height})`);

  return { ...target, buffer: optimized, width, height };
}

/**
 * Try to close common cookie banners and overlays so the underlying
 * page content is visible in the screenshot.
 */
async function dismissOverlays(page: Page): Promise<void> {
  const selectors = [
    // Common cookie consent buttons
    '[id*="cookie"] button',
    '[class*="cookie"] button',
    '[id*="consent"] button',
    '[class*="consent"] button',
    'button[aria-label*="accept"]',
    'button[aria-label*="Accept"]',
    'button[aria-label*="close"]',
    'button[aria-label*="Close"]',
    // Generic "Accept" / "Got it" / "OK" buttons in modals
    '.modal button:has-text("Accept")',
    '.modal button:has-text("Got it")',
    '.modal button:has-text("OK")',
    // Dismiss overlays
    '[class*="overlay"] [class*="close"]',
    '[class*="popup"] [class*="close"]',
  ];

  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 })) {
        await el.click({ timeout: 1000 });
        await page.waitForTimeout(300);
      }
    } catch {
      // Expected — most selectors won't match
    }
  }
}

/**
 * Downscale the 2x retina capture to TARGET_WIDTH and compress.
 * Uses JPEG for predictable file sizes. Falls back to progressive
 * quality reduction if still over the limit.
 */
async function optimizeScreenshot(rawPng: Buffer, url: string): Promise<Buffer> {
  // First pass: resize to target width, JPEG quality 85
  let result = await sharp(rawPng).resize({ width: TARGET_WIDTH }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();

  if (result.length <= MAX_IMAGE_BYTES) return result;

  // Progressively reduce quality
  for (const quality of [75, 65, 50]) {
    result = await sharp(rawPng).resize({ width: TARGET_WIDTH }).jpeg({ quality, mozjpeg: true }).toBuffer();

    logger.info(`Recompressed ${url} at quality=${quality}: ${result.length} bytes`);
    if (result.length <= MAX_IMAGE_BYTES) return result;
  }

  // Last resort: reduce dimensions too
  let width = TARGET_WIDTH;
  while (result.length > MAX_IMAGE_BYTES && width > 640) {
    width = Math.round(width * 0.75);
    result = await sharp(rawPng).resize({ width }).jpeg({ quality: 50, mozjpeg: true }).toBuffer();
    logger.info(`Resized ${url} to width=${width}: ${result.length} bytes`);
  }

  return result;
}

/**
 * Take screenshots of multiple URLs using Playwright.
 * Opens a single browser, processes all URLs sequentially in one context,
 * returns successfully captured screenshots (failures are non-fatal).
 */
export async function takeScreenshots(targets: ScreenshotTarget[]): Promise<CapturedScreenshot[]> {
  if (targets.length === 0) return [];

  logger.info(`Taking ${targets.length} screenshots with Playwright`);

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: TARGET_WIDTH, height: 800 },
      deviceScaleFactor: DEVICE_SCALE,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    const results: CapturedScreenshot[] = [];
    const page = await context.newPage();

    for (const target of targets) {
      try {
        const screenshot = await capturePage(page, target);
        results.push(screenshot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Screenshot failed for ${target.url}: ${msg}`);
      }
    }

    await context.close();

    logger.info(`Screenshots complete: ${results.length}/${targets.length} succeeded`);
    return results;
  } finally {
    await browser.close();
  }
}
