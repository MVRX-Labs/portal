import { task, logger } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, uploadFile } from "@/lib/gdrive";
import { buildSentimentDocx } from "@/lib/sentiment-docx-builder";
import { scrapeSentimentSources, type SourceType } from "@/lib/sentiment-scraper";
import {
  resolveModel,
  MODEL_MAP,
  currentMonth,
  extractJSON,
} from "@/lib/audit-utils";

const SENTIMENT_PROMPT = (productName: string, companyName: string, keywords: string, date: string) => `\
You are a product sentiment analyst at MVRX Labs. Your task is to analyse scraped data about "${productName}" by ${companyName} and produce a comprehensive sentiment analysis report.

Read ALL the data files in this directory. They contain scraped content from various platforms:
- reddit-data.json — Reddit discussions and threads
- reviews-data.json — Review site content (G2, Capterra, etc.)
- google-reviews-data.json — Google Maps/Business reviews
- google-search-data.json — Google search results and discovered mentions
- web-data.json — General web page content

Not all files may be present — analyse whatever is available.

${keywords ? `PAY SPECIAL ATTENTION to these keywords/themes: ${keywords}` : ""}

Produce your analysis as a **single JSON object** matching this schema:

interface SentimentAnalysisContent {
  productName: string;           // "${productName}"
  companyName: string;           // "${companyName}"
  preparedDate: string;          // "${date}"

  executiveSummary: {
    overallScore: number;        // 1-10 sentiment score
    distribution: {
      positive: number;          // percentage (0-100)
      neutral: number;
      negative: number;
    };
    summary: string[];           // 2-3 paragraph executive summary
    keyFindings: string[];       // 3-5 bullet points
  };

  platformBreakdown: Array<{
    platform: string;            // e.g. "Reddit", "G2", "Google Reviews"
    sentimentScore: number;      // 1-10
    sampleSize: number;          // number of mentions/reviews analysed
    summary: string;             // 2-3 sentence summary
    topPositive: string[];       // 3-5 positive themes
    topNegative: string[];       // 3-5 negative themes
  }>;

  themeAnalysis: Array<{
    theme: string;               // e.g. "Pricing", "Ease of Use", "Customer Support"
    sentiment: "positive" | "mixed" | "negative";
    score: number;               // 1-10
    mentionCount: number;        // approximate count
    summary: string;             // 2-3 sentence analysis
    representativeQuotes: Array<{
      quote: string;
      source: string;            // platform + context
      sentiment: "positive" | "neutral" | "negative";
    }>;                          // 2-4 quotes per theme
  }>;

  topQuotes: {
    positive: Array<{
      quote: string;
      source: string;
      context: string;           // brief context
    }>;                          // 5-8 best positive quotes
    negative: Array<{
      quote: string;
      source: string;
      context: string;
    }>;                          // 5-8 most notable negative quotes
  };

  competitiveContext: {
    competitorMentions: Array<{
      competitor: string;
      mentionCount: number;
      context: string;           // how they're compared to ${productName}
    }>;
    competitivePosition: string; // paragraph about competitive standing
  };

  recommendations: Array<{
    priority: "high" | "medium" | "low";
    area: string;                // e.g. "Product", "Marketing", "Support"
    recommendation: string;      // specific actionable recommendation
    supportingEvidence: string;  // what data supports this
  }>;                            // 8-12 recommendations, sorted by priority

  sourceAppendix: Array<{
    platform: string;
    url?: string;
    description: string;
    itemsAnalysed: number;
  }>;
}

ANALYSIS GUIDELINES:
- Be data-driven: reference specific numbers, quotes, and patterns from the scraped data.
- Be honest: if sentiment is negative, say so clearly. Don't sugarcoat.
- Quote actual user language where possible — this is the most valuable part for the client.
- If a platform has no data, skip it in the breakdown (don't fabricate).
- For theme analysis, derive themes from the actual data — don't use generic themes unless the data supports them.
- Recommendations should be specific and actionable, not generic advice.
- Sort recommendations by impact (high priority first).

CRITICAL: Your final text response MUST contain the raw JSON object directly.
Do NOT use any tool to save the JSON to a file. Do NOT summarise the results.
Just output the raw JSON object as your final message. No markdown formatting, no code fences, no text before or after — only the JSON.`;

interface SentimentAnalysisPayload {
  runId: string;
  productName: string;
  companyName: string;
  accountName?: string;
  sources: SourceType;
  additionalUrls: string[];
  keywords: string;
  model?: string;
}

const PLATFORM_FILE_MAP: Record<string, string> = {
  reddit: "reddit-data.json",
  "google-search": "google-search-data.json",
  "google-reviews": "google-reviews-data.json",
  web: "web-data.json",
  reviews: "reviews-data.json",
};

export const sentimentAnalysisTask = task({
  id: "sentiment-analysis-generation",
  maxDuration: 3600,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: SentimentAnalysisPayload, { signal }) => {
    const { runId, productName, companyName, accountName, sources, additionalUrls, keywords, model } = payload;

    const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);

    try {
      // 1. Scrape sentiment sources via Apify
      logger.info("Starting sentiment scrape via Apify", { runId, productName, companyName, sources });
      const scrapeStart = Date.now();

      const scrapedData = await scrapeSentimentSources(
        productName,
        companyName,
        sources,
        additionalUrls,
        signal,
      );

      const scrapeElapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
      logger.info(`Scrape finished in ${scrapeElapsed}s (${scrapedData.sources.length} sources)`);

      // 2. Set up session directory with scraped data
      await mkdir(sessionDir, { recursive: true });

      for (const source of scrapedData.sources) {
        const filename = PLATFORM_FILE_MAP[source.platform] || `${source.platform}-data.json`;
        await writeFile(join(sessionDir, filename), JSON.stringify(source.data, null, 2), "utf-8");
        logger.info(`Wrote ${filename}`);
      }

      // 3. Run Claude Agent SDK
      const preparedDate = currentMonth();
      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);

      logger.info("Starting Claude Agent SDK", { model: resolvedModel });
      const claudeStart = Date.now();

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";

      for await (const message of query({
        prompt: SENTIMENT_PROMPT(productName, companyName, keywords, preparedDate),
        options: {
          model: resolvedModel,
          abortController,
          cwd: sessionDir,
          allowedTools: ["Read", "Glob"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 30,
          persistSession: false,
        },
      })) {
        if (message.type === "system" && "subtype" in message && message.subtype === "init") {
          logger.info("Claude session initialized", { model: (message as any).model });
        }

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

      // 4. Extract JSON and build DOCX
      const json = extractJSON(output);
      const content = JSON.parse(json);

      logger.info("Building DOCX");
      const buf = await buildSentimentDocx(content);

      // 5. Upload to Google Drive
      const rootFolderId = getGeneratedMaterialsFolderId();

      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const filename = `MVRX | ${productName} | Sentiment Analysis.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, buf, DOCX_MIME, targetFolderId);
      logger.info(`DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(buf.length / 1024).toFixed(0)} KB)`);

      // 6. Clean up
      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      // 7. Update DB
      const outputMessage = `Sentiment analysis document saved: ${filename}`;
      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: outputMessage,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("Run marked as completed in DB", { runId });

      return { success: true, filename, driveUrl: driveFile.webViewLink };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Sentiment analysis failed: ${errorMessage}`, { runId });

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "sentiment-analysis",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
