import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { mkdir, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, uploadFile } from "@/lib/gdrive";
import { runClaudeAgent } from "@/lib/claude-agent";
import { MODEL_MAP, type MODEL_IDS } from "@/lib/audit-utils";
import {
  fetchPage,
  fetchRobotsTxt,
  crawlSitemap,
  analyzeCitability,
  scanBrandPresence,
  validateLlmsTxt,
} from "@/lib/geo-audit";
import type {
  PageAnalysis,
  RobotsAnalysis,
  CitabilityResult,
  BrandScanResult,
  LlmsTxtValidation,
  SitemapResult,
} from "@/lib/geo-audit";
import { buildGeoAuditDocx } from "@/lib/geo-audit-docx/builder";
import type { GeoAuditContent } from "@/lib/geo-audit-docx/schema";

interface GeoAuditPayload {
  runId: string;
  url: string;
  brandName?: string;
  accountName?: string;
  model?: MODEL_IDS;
}

const TOTAL_STEPS = 6;

function buildAuditPrompt(
  url: string,
  brandName: string,
  pageData: PageAnalysis,
  robotsData: RobotsAnalysis,
  citabilityData: CitabilityResult | null,
  brandData: BrandScanResult,
  llmsTxtData: LlmsTxtValidation,
  sitemapData: SitemapResult
): string {
  return `\
You are performing a GEO (Generative Engine Optimization) audit on ${url} for the brand "${brandName}".

GEO measures how well a website is optimized for AI-powered search engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) — NOT traditional SEO.

I have pre-gathered technical data for you. Your job is to ANALYZE this data, supplement it with web research, and produce structured JSON output.

## Pre-Gathered Data

### Page Analysis (homepage)
\`\`\`json
${JSON.stringify(
  {
    url: pageData.url,
    statusCode: pageData.statusCode,
    title: pageData.title,
    description: pageData.description,
    canonical: pageData.canonical,
    h1Tags: pageData.h1Tags,
    headingStructure: pageData.headingStructure.slice(0, 30),
    wordCount: pageData.wordCount,
    structuredData: pageData.structuredData,
    securityHeaders: pageData.securityHeaders,
    hasSsrContent: pageData.hasSsrContent,
    internalLinkCount: pageData.internalLinks.length,
    externalLinkCount: pageData.externalLinks.length,
    imageCount: pageData.images.length,
    imagesWithoutAlt: pageData.images.filter((i) => !i.alt).length,
    errors: pageData.errors,
  },
  null,
  2
)}
\`\`\`

### AI Crawler Access (robots.txt)
\`\`\`json
${JSON.stringify(
  {
    exists: robotsData.exists,
    aiCrawlerStatus: robotsData.aiCrawlerStatus,
    sitemapCount: robotsData.sitemaps.length,
    errors: robotsData.errors,
  },
  null,
  2
)}
\`\`\`

### Citability Analysis
\`\`\`json
${
  citabilityData
    ? JSON.stringify(
        {
          totalBlocksAnalyzed: citabilityData.totalBlocksAnalyzed,
          averageCitabilityScore: citabilityData.averageCitabilityScore,
          optimalLengthPassages: citabilityData.optimalLengthPassages,
          gradeDistribution: citabilityData.gradeDistribution,
          top3Citable: citabilityData.top5Citable.slice(0, 3).map((b) => ({
            heading: b.heading,
            score: b.totalScore,
            grade: b.grade,
            preview: b.preview,
          })),
          bottom3Citable: citabilityData.bottom5Citable.slice(0, 3).map((b) => ({
            heading: b.heading,
            score: b.totalScore,
            grade: b.grade,
            preview: b.preview,
          })),
        },
        null,
        2
      )
    : '"Citability analysis failed — assess manually using the content"'
}
\`\`\`

### llms.txt Validation
\`\`\`json
${JSON.stringify(
  {
    exists: llmsTxtData.exists,
    formatValid: llmsTxtData.formatValid,
    hasTitle: llmsTxtData.hasTitle,
    hasDescription: llmsTxtData.hasDescription,
    hasSections: llmsTxtData.hasSections,
    hasLinks: llmsTxtData.hasLinks,
    sectionCount: llmsTxtData.sectionCount,
    linkCount: llmsTxtData.linkCount,
    issues: llmsTxtData.issues,
    suggestions: llmsTxtData.suggestions,
    fullVersionExists: llmsTxtData.fullVersion.exists,
  },
  null,
  2
)}
\`\`\`

### Brand Presence (Wikipedia/Wikidata verified, others need web research)
\`\`\`json
${JSON.stringify(
  {
    wikipedia: {
      hasPage: brandData.platforms.wikipedia.hasWikipediaPage,
      hasWikidata: brandData.platforms.wikipedia.hasWikidataEntry,
      wikidataId: brandData.platforms.wikipedia.wikidataId,
    },
    searchUrls: {
      youtube: brandData.platforms.youtube.searchUrl,
      reddit: brandData.platforms.reddit.searchUrl,
      linkedin: brandData.platforms.linkedin.searchUrl,
    },
  },
  null,
  2
)}
\`\`\`

### Sitemap
Discovered ${sitemapData.count} pages from sitemap.xml.
${sitemapData.pages.length > 0 ? `Sample pages: ${sitemapData.pages.slice(0, 10).join(", ")}` : "No sitemap found or empty sitemap."}

## Your Research Tasks

Use WebSearch and WebFetch to supplement the pre-gathered data:

1. **Brand Authority**: Search for "${brandName}" to assess brand presence on YouTube, Reddit, LinkedIn, review sites, and in industry publications. Check the search URLs provided above.
2. **Content E-E-A-T**: Visit 2-3 key pages (blog posts, about page, service pages) to assess expertise, experience, authoritativeness, and trustworthiness signals.
3. **Schema Completeness**: Review the structured data found and identify what's missing for the business type.
4. **Platform Optimization**: Search for "${brandName}" on Google and check if they appear in AI-generated answers, featured snippets, or People Also Ask.

## Scoring

Score each dimension 0-100 and calculate the composite GEO Score:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| AI Citability | 25% | How likely AI models are to cite this site's content |
| Brand Authority | 20% | Brand presence across AI-cited platforms |
| Content & E-E-A-T | 20% | Expertise, experience, authority, trust signals |
| Technical | 15% | AI crawler access, llms.txt, SSR, page speed signals |
| Schema/Structured Data | 10% | JSON-LD completeness and correctness |
| Platform Optimization | 10% | Optimization for AI search platforms |

**GEO Score = (Citability × 0.25) + (Brand × 0.20) + (E-E-A-T × 0.20) + (Technical × 0.15) + (Schema × 0.10) + (Platform × 0.10)**

## Tone and Style

Write like a sharp strategist, not a consultant. Be direct and opinionated.
- Short, punchy sentences. No filler words. No corporate language.
- When something is bad, say it plainly: "No structured data exists. This is a critical gap."
- Reference specific data points: scores, crawler names, schema types, percentages.
- Finding format: "Key metric or finding: One sentence of explanation." The text before the first colon will appear bold in the final report.
- Recommendations: action items only. No justification paragraphs. The reader already read the findings.
- Every sentence must earn its place. If it could be cut without losing meaning, cut it.

## Output

Write a SINGLE file called GEO-AUDIT-CONTENT.json in the current directory. This JSON will be used to generate a professional DOCX report. The JSON must conform EXACTLY to this schema:

\`\`\`json
{
  "brandName": "${brandName}",
  "url": "${url}",
  "date": "${new Date().toISOString().split("T")[0]}",
  "geoScore": <number 0-100>,
  "scores": {
    "citability": {
      "score": <number 0-100>,
      "findings": ["Metric or finding: One sentence explanation.", "..."],
      "recommendations": ["Action item: What to do, specifically.", "..."]
    },
    "brandAuthority": { "score": <number>, "findings": ["..."], "recommendations": ["..."] },
    "contentEeat": { "score": <number>, "findings": ["..."], "recommendations": ["..."] },
    "technical": { "score": <number>, "findings": ["..."], "recommendations": ["..."] },
    "schema": { "score": <number>, "findings": ["..."], "recommendations": ["..."] },
    "platformOptimization": { "score": <number>, "findings": ["..."], "recommendations": ["..."] }
  },
  "executiveSummary": {
    "overview": "2 sentences max. State the GEO Score and the single most important takeaway.",
    "keyFindings": [
      "One-sentence bullet point summarizing a key finding",
      "Another key finding — 5-6 bullets total, one sentence each"
    ]
  },
  "criticalIssues": [
    {
      "severity": "critical|high|medium|low",
      "title": "Short issue title (5 words max)",
      "description": "One sentence describing impact."
    }
  ],
  "quickWins": [
    "Quick win: specific action that can be done in under a day",
    "Another quick win — 5 items total, one sentence each"
  ],
  "actionPlan": [
    { "week": 1, "theme": "Theme (3 words max)", "actions": ["Action 1", "Action 2", "Action 3"] },
    { "week": 2, "theme": "Theme", "actions": ["Action 1", "Action 2", "Action 3"] },
    { "week": 3, "theme": "Theme", "actions": ["Action 1", "Action 2", "Action 3"] },
    { "week": 4, "theme": "Theme", "actions": ["Action 1", "Action 2", "Action 3"] }
  ]
}
\`\`\`

CRITICAL RULES:
- Each category: 3-5 findings, 3-5 recommendations. Each finding/recommendation is ONE sentence. No multi-sentence paragraphs.
- Finding format: "Label: explanation." The label before the colon will be bolded in the report.
- criticalIssues: 3-6 items, ordered by severity. Title is 5 words max. Description is one sentence.
- quickWins: exactly 5 items, one sentence each.
- executiveSummary.overview: exactly 2 sentences. executiveSummary.keyFindings: 5-6 one-sentence bullets.
- The geoScore MUST equal the weighted sum: (citability*0.25 + brandAuthority*0.20 + contentEeat*0.20 + technical*0.15 + schema*0.10 + platformOptimization*0.10), rounded to nearest integer.
- Write ONLY the JSON file. No markdown files. No explanation text.
- Be specific to ${brandName}. No generic SEO advice.
`;
}

function extractJSON(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export const geoAuditTask = task({
  id: "geo-audit",
  queue: {
    name: "geo-audit",
    concurrencyLimit: 2,
  },
  maxDuration: 1800,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
  },
  run: async (payload: GeoAuditPayload) => {
    const { runId, url, accountName, model = "sonnet" } = payload;
    const brandName = payload.brandName || new URL(url).hostname.replace("www.", "").split(".")[0];

    logger.info(`Starting GEO audit for ${url}`, { runId, brandName, model });

    const sessionDir = join(tmpdir(), `geo-audit-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });

    try {
      // --- Step 1: Pre-gather technical data ---
      metadata.set("progress", {
        step: "Gathering technical data",
        stepNumber: 1,
        totalSteps: TOTAL_STEPS,
        percentage: 5,
      });

      logger.info("Fetching page data, robots.txt, llms.txt, sitemap in parallel");
      const [pageData, robotsData, sitemapData, llmsTxtData, brandData] = await Promise.all([
        fetchPage(url),
        fetchRobotsTxt(url),
        crawlSitemap(url),
        validateLlmsTxt(url),
        scanBrandPresence(brandName, new URL(url).hostname),
      ]);

      logger.info(
        `Page: ${pageData.wordCount} words, ${pageData.structuredData.length} schemas. ` +
          `Robots: ${robotsData.exists ? "found" : "missing"}. ` +
          `Sitemap: ${sitemapData.count} pages. ` +
          `llms.txt: ${llmsTxtData.exists ? "found" : "missing"}`
      );

      // --- Step 2: Citability analysis ---
      metadata.set("progress", {
        step: "Analyzing content citability",
        stepNumber: 2,
        totalSteps: TOTAL_STEPS,
        percentage: 20,
      });

      let citabilityData: CitabilityResult | null = null;
      try {
        citabilityData = await analyzeCitability(url);
        logger.info(
          `Citability: ${citabilityData.averageCitabilityScore}/100 avg across ${citabilityData.totalBlocksAnalyzed} blocks`
        );
      } catch (err) {
        logger.warn(`Citability analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // --- Step 3: Run Claude agent for analysis ---
      metadata.set("progress", {
        step: "AI analysis and scoring",
        stepNumber: 3,
        totalSteps: TOTAL_STEPS,
        percentage: 35,
      });

      const prompt = buildAuditPrompt(
        url,
        brandName,
        pageData,
        robotsData,
        citabilityData,
        brandData,
        llmsTxtData,
        sitemapData
      );

      logger.info(`Running Claude agent (${model}) for analysis`);
      const agentResult = await runClaudeAgent(prompt, sessionDir, {
        allowedTools: ["WebSearch", "WebFetch", "Read", "Write"],
        maxTurns: 60,
        model: MODEL_MAP[model],
      });

      logger.info(
        `Agent completed: ${agentResult.turns} turns, $${agentResult.costUsd.toFixed(4)}, ${(agentResult.durationMs / 1000).toFixed(0)}s`
      );

      // --- Step 4: Parse structured JSON ---
      metadata.set("progress", {
        step: "Parsing audit results",
        stepNumber: 4,
        totalSteps: TOTAL_STEPS,
        percentage: 70,
      });

      let content: GeoAuditContent;
      try {
        const raw = await readFile(join(sessionDir, "GEO-AUDIT-CONTENT.json"), "utf-8");
        content = JSON.parse(raw);
      } catch {
        logger.warn("Content JSON not found in file, attempting to extract from agent output");
        const jsonStr = extractJSON(agentResult.output);
        if (!jsonStr) throw new Error("Could not extract structured JSON from agent output");
        content = JSON.parse(jsonStr);
      }

      // Validate minimum structure
      if (!content.geoScore || !content.scores || !content.executiveSummary) {
        throw new Error("Agent output missing required fields (geoScore, scores, or executiveSummary)");
      }

      logger.info(`GEO Score: ${content.geoScore}/100`);

      // --- Step 5: Build DOCX ---
      metadata.set("progress", {
        step: "Building report document",
        stepNumber: 5,
        totalSteps: TOTAL_STEPS,
        percentage: 80,
      });

      const docxBuffer = await buildGeoAuditDocx(content);
      logger.info(`DOCX built: ${(docxBuffer.length / 1024).toFixed(0)} KB`);

      // --- Step 6: Upload to Google Drive ---
      metadata.set("progress", {
        step: "Uploading to Google Drive",
        stepNumber: 6,
        totalSteps: TOTAL_STEPS,
        percentage: 90,
      });

      const rootFolderId = getGeneratedMaterialsFolderId();
      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const filename = `MVRX | ${brandName} | GEO Audit.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, docxBuffer, DOCX_MIME, targetFolderId);
      logger.info(
        `DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(docxBuffer.length / 1024).toFixed(0)} KB)`
      );

      // --- Update DB (non-fatal if runId doesn't exist) ---
      const outputMessage = `GEO Audit complete for ${brandName}: Score ${content.geoScore}/100`;
      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: outputMessage,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId))
        .catch((e) => logger.warn(`Could not update toolRun ${runId}: ${e}`));

      metadata.set("progress", { step: "Complete", stepNumber: 6, totalSteps: TOTAL_STEPS, percentage: 100 });

      return {
        success: true,
        url,
        brandName,
        geoScore: content.geoScore,
        scores: content.scores,
        driveUrl: driveFile.webViewLink,
        costUsd: agentResult.costUsd,
        durationMs: agentResult.durationMs,
        turns: agentResult.turns,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`GEO audit failed: ${errorMessage}`, { runId, url });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "geo-audit",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    } finally {
      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    }
  },
});
