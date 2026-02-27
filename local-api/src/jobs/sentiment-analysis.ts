import { Router } from "express";
import { writeFile } from "fs/promises";
import { join } from "path";
import { runClaudeJob, log } from "../lib/claude-runner.js";
import { OUTPUT_DIR, MODEL_MAP, resolveModel, currentMonth, extractJSON } from "../lib/job-utils.js";

const router = Router();

interface ScrapedSource {
  platform: string;
  data: unknown;
}

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

interface SentimentAnalysisRequest {
  runId: string;
  productName: string;
  companyName: string;
  scrapedSources: ScrapedSource[];
  keywords: string;
  model?: string;
  callbackUrl: string;
}

router.post("/sentiment-analysis", (req, res) => {
  const { runId, productName, companyName, scrapedSources, keywords, model, callbackUrl } =
    req.body as SentimentAnalysisRequest;

  if (!runId || !productName || !companyName || !callbackUrl) {
    res.status(400).json({ error: "runId, productName, companyName, and callbackUrl are required" });
    return;
  }

  log(
    runId,
    `Received sentiment-analysis job for "${productName}" (${companyName}), ${scrapedSources?.length || 0} sources`,
  );
  res.status(202).json({ status: "accepted" });

  const preparedDate = currentMonth();

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: resolveModel(model, MODEL_MAP.haiku),
    maxTurns: 30,
    allowedTools: ["Read", "Glob"],
    prompt: SENTIMENT_PROMPT(productName, companyName, keywords, preparedDate),

    setupSession: async (dir) => {
      const platformFileMap: Record<string, string> = {
        reddit: "reddit-data.json",
        "google-search": "google-search-data.json",
        "google-reviews": "google-reviews-data.json",
        web: "web-data.json",
        reviews: "reviews-data.json",
      };

      if (scrapedSources && scrapedSources.length > 0) {
        for (const source of scrapedSources) {
          const filename = platformFileMap[source.platform] || `${source.platform}-data.json`;
          await writeFile(join(dir, filename), JSON.stringify(source.data, null, 2), "utf-8");
          log(runId, `Wrote ${filename}`);
        }
      }
    },

    postProcess: async (output) => {
      const json = extractJSON(output);
      const content = JSON.parse(json);

      const filename = `MVRX | ${productName} | Sentiment Analysis.docx`;
      const filepath = join(OUTPUT_DIR, filename);

      const { buildSentimentDocx } = await import("../lib/sentiment-docx-builder.js");
      const buf = await buildSentimentDocx(content);
      await writeFile(filepath, buf);

      log(runId, `DOCX written → ${filepath} (${(buf.length / 1024).toFixed(0)} KB)`);
      return `Sentiment analysis document saved: ${filename}`;
    },
  });
});

export default router;
