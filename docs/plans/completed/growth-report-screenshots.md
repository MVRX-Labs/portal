# Growth Report Screenshots

**Status: IMPLEMENTED**

## What Was Built

Website screenshots embedded in the growth report DOCX, with Claude agents selecting pages and evaluating screenshot quality.

### Pipeline addition

After Phase 2 data collection, before Phase 3 analysis:

1. **Discovery agent** identifies 4–8 screenshot-worthy pages (homepage, key product pages, competitor homepages, blog)
2. **`screenshotPages()`** captures them via `apify/screenshot-url` actor in parallel
3. **`evaluateScreenshots()`** sends all images to Claude Sonnet (multimodal) for keep/reject evaluation — only rejects truly broken renders
4. Approved screenshots written to session dir with metadata (`screenshots.json`)
5. **Analysis agent** told about approved screenshots, assigns them to report sections
6. **Builder** embeds `ImageRun` blocks via `screenshotBlock()` helper, scaled to max 620px width

### Key files

- `src/lib/growth-report/screenshots.ts` — `evaluateScreenshots()` multimodal Claude call
- `src/lib/growth-report/take-screenshots.ts` — `screenshotPages()` Apify capture helper
- `src/lib/growth-report/styles.ts` — `screenshotBlock()` ImageRun builder
- `src/lib/growth-report/discovery.ts` — extended with `screenshotTargets[]` output
- `src/lib/growth-report/schema.ts` — extended with `screenshots[]` field on `GrowthReportContent`

### Cost impact: ~$0.03–0.08 per report additional
### Dependencies: `image-size` package for PNG dimension detection
