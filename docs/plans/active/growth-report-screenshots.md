# Growth Report Screenshots

Add website screenshots to the growth report DOCX, with Claude agents selecting which pages to capture and evaluating screenshot quality before inclusion.

## Design Decisions

**Apify actor**: `apify/screenshot-url` (official, `rGCyoaKTKhyMiiTvS`). Returns persistent KV store URLs (no expiry), works with the existing `apify()` helper. Simple input, reliable.

**Image sizing**: Add `image-size` package (zero-dep, ~5KB) to read actual pixel dimensions from PNG buffers. Needed because `docx` `ImageRun` requires explicit width/height and has no auto-detection. Target rendering width: ~620px (fits the DOCX body content area with margins).

**Screenshot selection**: Part of the discovery Claude agent. It already researches the company via WebSearch/WebFetch and knows which pages exist. Adding "pick 4-6 screenshot-worthy URLs" to its prompt is a natural extension.

**Screenshot evaluation**: New Claude agent invocation (multimodal) between data collection and analysis. Reviews each screenshot image and decides keep/reject. Reasons to reject: cookie/consent overlays blocking content, login walls, CAPTCHA pages, empty/broken pages, NSFW content, completely irrelevant content. This is a lightweight call — just image evaluation, no tools needed.

**Where screenshots appear in the report**: Inline within relevant sections. The analysis Claude agent decides placement (e.g., homepage screenshot in executive summary, competitor screenshots in competitive benchmarking, blog screenshot in content audit). Screenshots that don't map to a section are omitted.

## Pipeline Changes

Current steps:

```
1. Load account  →  2. Discovery  →  3. Scrapers  →  4. Analysis  →  5. Review  →  6. Build & Upload
```

Updated steps:

```
1. Load account
2. Discovery          ← prompt update: also output screenshotTargets[]
3. Scrapers           ← new: screenshotPages() runs in parallel with existing scrapers
3.5 Screenshot eval   ← NEW: Claude multimodal agent reviews screenshots, writes approved list
4. Analysis           ← prompt update: include screenshot metadata, assign to sections
5. Review             ← no change (sections with bad screenshot refs get cleaned)
6. Build & Upload     ← builder embeds ImageRun for screenshots in each section
```

## File Changes

### 1. `package.json` — Add `image-size` dependency

```
npm install image-size
```

Zero-dependency package. Returns `{ width, height, type }` from a Buffer.

### 2. `src/lib/growth-report/discovery.ts` — Extend DiscoveryResult

Add to the `DiscoveryResult` interface:

```ts
screenshotTargets: {
  url: string; // Full URL to screenshot
  context: string; // Why this page matters (e.g., "homepage", "pricing page", "main competitor homepage")
  section: string; // Which report section this relates to (e.g., "executiveSummary", "competitiveBenchmarking")
}
[];
```

Update the discovery prompt to instruct Claude to identify 4-8 high-value pages to screenshot:

- The target company's homepage (always)
- 1-2 key product/feature pages
- 1-2 top competitor homepages (for visual comparison in competitive section)
- Blog/content hub page (if exists)
- Any page with notable UX/design issues found during research

The discovery agent already visits these pages via WebFetch during research, so it knows which ones exist and are accessible.

### 3. `src/lib/growth-report/scrapers.ts` — Add `screenshotPages()`

New exported function following the existing pattern:

```ts
const SCREENSHOT_ACTOR = "apify/screenshot-url";

export async function screenshotPages(
  targets: { url: string; context: string; section: string }[]
): Promise<{ url: string; context: string; section: string; screenshotUrl: string }[]> {
  // Run screenshots in parallel (one actor call per URL)
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const items = await apify(
        SCREENSHOT_ACTOR,
        {
          url: target.url,
          waitUntil: "networkidle2",
          delay: 2000, // 2s delay for animations/lazy content
          viewportWidth: 1280, // Standard desktop width
        },
        `Screenshot: ${target.context}`
      );
      // Actor returns array with one item containing screenshotUrl
      const item = (items as any[])?.[0];
      if (!item?.screenshotUrl) throw new Error(`No screenshot returned for ${target.url}`);
      return { ...target, screenshotUrl: item.screenshotUrl };
    })
  );

  // Return only successful screenshots (failures are non-fatal)
  return results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled").map((r) => r.value);
}
```

### 4. `src/lib/growth-report/screenshots.ts` — NEW: Screenshot evaluation + download

New module with two functions:

#### `evaluateScreenshots()` — Claude multimodal evaluation

```ts
export async function evaluateScreenshots(
  screenshots: { url: string; context: string; section: string; screenshotUrl: string }[],
  companyName: string,
  sessionDir: string
): Promise<ApprovedScreenshot[]>;
```

For each screenshot:

1. Fetch the PNG from the Apify KV store URL → Buffer
2. Send to Claude (Sonnet, multimodal) with the image and a prompt:
   - "You are evaluating a screenshot of {url} for inclusion in a professional growth report for {companyName}."
   - "Context: {context}"
   - Only reject screenshots that are clearly broken — e.g., the page failed to render, the screenshot captured mid-JS-rendering so content is incomplete/garbled, the image is blank or shows an error page, or the screenshot is corrupted/unreadable.
   - Screenshots showing cookie banners, login pages, popups, or unexpected content should generally be KEPT — these can be valuable to comment on in the report (e.g., "visitors are greeted with a consent wall" or "the page requires authentication").
   - Return JSON: `{ include: boolean, reason: string, caption: string }`
   - If `include: true`, provide a professional 1-sentence caption for the report that describes what the screenshot shows (including any notable issues visible)
3. If approved, save the PNG buffer to `{sessionDir}/screenshot-{index}.png`
4. Write `{sessionDir}/screenshots.json` with metadata for approved screenshots

Can batch multiple images into a single Claude call for efficiency (send all images at once with numbered evaluation).

**Return type:**

```ts
interface ApprovedScreenshot {
  url: string;
  section: string; // Which report section this belongs to
  context: string;
  caption: string; // Claude-generated caption
  filename: string; // e.g., "screenshot-0.png"
  width: number; // Actual pixel dimensions (from image-size)
  height: number;
}
```

### 5. `src/lib/growth-report/schema.ts` — Add screenshot fields

Add to `GrowthReportContent`:

```ts
// Top-level: available screenshots
screenshots?: {
  url: string;
  section: string;
  caption: string;
  filename: string;   // Path relative to session dir
  width: number;
  height: number;
}[];
```

No per-section screenshot fields needed — the analysis agent assigns screenshots to sections via the `section` field, and the builder looks them up by section name.

### 6. `src/lib/growth-report/analysis-prompt.ts` — Tell Claude about screenshots

Add to the analysis prompt (after the data files section):

```
## Available Screenshots

The following screenshots have been captured and approved for inclusion in the report.
Assign each to the most appropriate section by referencing them in your output.

{screenshots.json contents}

When writing section content, reference screenshots where they add value.
The builder will automatically place them based on the section field.
```

No schema change needed for the AI output — screenshots are pre-assigned to sections and the builder handles placement. The analysis agent just needs to be aware they exist so it can write relevant surrounding text.

### 7. `src/lib/growth-report/styles.ts` — Add image helper

```ts
import { ImageRun, Paragraph, AlignmentType } from "docx";
import sizeOf from "image-size";

const MAX_IMAGE_WIDTH = 620; // pixels, fits body content area

export function screenshotBlock(imageBuffer: Buffer, caption: string): Paragraph[] {
  const dimensions = sizeOf(imageBuffer);
  const actualW = dimensions.width ?? 1280;
  const actualH = dimensions.height ?? 800;

  // Scale to fit content width, preserving aspect ratio
  const scale = Math.min(1, MAX_IMAGE_WIDTH / actualW);
  const renderW = Math.round(actualW * scale);
  const renderH = Math.round(actualH * scale);

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children: [
        new ImageRun({
          type: "png",
          data: imageBuffer,
          transformation: { width: renderW, height: renderH },
          outline: {
            type: "solidFill",
            solidFillType: "rgb",
            value: C.tableBorder, // Subtle gray border matching table style
            width: 12700, // 1pt in EMUs
          },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [tr(caption, { size: SZ.dataSrc, color: C.gray, italics: true })],
    }),
  ];
}
```

### 8. `src/lib/growth-report/builder.ts` — Embed screenshots in sections

Update `buildGrowthReportDocx()` to:

1. Accept an additional parameter: `screenshotBuffers: Map<string, Buffer>` (filename → buffer)
2. For each section, check if any screenshots are assigned to it via `content.screenshots`
3. Insert `screenshotBlock()` after the section header / before findings

```ts
function sectionScreenshots(
  content: GrowthReportContent,
  sectionName: string,
  buffers: Map<string, Buffer>
): Paragraph[] {
  if (!content.screenshots) return [];
  return content.screenshots
    .filter((s) => s.section === sectionName)
    .flatMap((s) => {
      const buf = buffers.get(s.filename);
      if (!buf) return [];
      return screenshotBlock(buf, s.caption);
    });
}
```

Then in each section builder, add after the section heading:

```ts
...sectionScreenshots(content, "trafficAnalysis", buffers),
```

### 9. `src/trigger/growth-report.ts` — Wire it all together

#### After Step 3 (data collection), add Step 3.5:

```ts
// Step 3.5: Capture & evaluate screenshots
logger.info("Step 3.5: Capturing screenshots", { step: "3.5/6" });
let approvedScreenshots: ApprovedScreenshot[] = [];

if (discovery.screenshotTargets?.length) {
  // Capture via Apify
  const rawScreenshots = await screenshotPages(discovery.screenshotTargets);

  // Evaluate with Claude (multimodal)
  approvedScreenshots = await evaluateScreenshots(rawScreenshots, account.name, sessionDir);

  // Write metadata for analysis phase
  await fs.writeFile(path.join(sessionDir, "screenshots.json"), JSON.stringify(approvedScreenshots, null, 2));

  logger.info(`Screenshots: ${approvedScreenshots.length}/${rawScreenshots.length} approved`);
}
```

#### In Step 6 (build), load screenshot buffers:

```ts
const screenshotBuffers = new Map<string, Buffer>();
for (const s of approvedScreenshots) {
  const buf = await fs.readFile(path.join(sessionDir, s.filename));
  screenshotBuffers.set(s.filename, buf);
}
const docxBuffer = await buildGrowthReportDocx(content, screenshotBuffers);
```

## Cost Impact

Per report (assuming 6 screenshot targets):

- **Apify screenshot runs**: ~$0.02-0.05 (6 lightweight actor runs)
- **Claude Sonnet evaluation call**: ~$0.01-0.03 (small prompt + 6 images)
- **Total additional cost**: ~$0.03-0.08 per report
- **Additional time**: ~30-45s (screenshots run in parallel with other scrapers, evaluation is fast)

## Risks & Mitigations

| Risk                             | Mitigation                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Cookie banners blocking content  | Kept intentionally — evaluation agent writes captions noting them, useful for the report |
| Screenshot actor timeout (>300s) | Individual screenshots time out independently; failures are non-fatal                    |
| Large images bloating DOCX       | Scale to max 620px width; PNG screenshots of single viewports are ~200-500KB each        |
| Discovery agent picks bad URLs   | Evaluation step is the safety net; worst case = 0 screenshots (report still works)       |
| DOCX file size increase          | 6 screenshots × ~300KB avg = ~1.8MB additional. Acceptable for a comprehensive report    |

## What Does NOT Change

- Review prompt (already handles removing sections/bad data — screenshots that reference missing sections get cleaned up naturally)
- Google Drive upload (already handles any buffer size)
- Slack failure notifications
- API route / frontend
- Database schema
- No new env vars needed (reuses existing APIFY_API_TOKEN and ANTHROPIC_API_KEY)
