import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, uploadFile } from "@/lib/gdrive";
import { buildGtmDocx } from "@/lib/gtm-docx-builder";
import type { GTMStrategyContent } from "@/lib/gtm-schema";
import { resolveModel, MODEL_MAP, currentMonth, extractJSON } from "@/lib/audit-utils";

const GTM_PROMPT = (
  companyName: string,
  industry: string,
  targetAudience: string,
  productDescription: string,
  date: string
) => `\
You are a senior go-to-market strategist at MVRX Labs creating a comprehensive GTM launch strategy for "${companyName}".

PHASE 1 — RESEARCH (do this first):
Use WebSearch to research the following. Perform at least 7 separate searches:
1. "${companyName}" — company website, product offerings, current positioning
2. "${companyName}" competitors in ${industry}
3. Top 3-4 competitors to "${companyName}" — their positioning, strengths, weaknesses
4. ${industry} market trends and growth data
5. Best marketing channels for ${industry} targeting ${targetAudience}
6. "${companyName}" social media presence and digital footprint
7. ${industry} SEO landscape and keyword opportunities

Use WebFetch to visit the company website and key competitor websites for deeper analysis.

PHASE 2 — STRATEGY GENERATION:
Based on your research, produce a comprehensive GTM launch strategy as a single JSON object matching this schema:

interface GTMStrategyContent {
  companyName: string;            // "${companyName}"
  industry: string;               // "${industry}"
  targetAudience: string;         // "${targetAudience}"
  preparedDate: string;           // "${date}"
  preparedFor: string;            // "${companyName}"

  situationOverview: {
    summary: string;              // 2-3 paragraph overview of the company's current market position
    whatsWorking: string[];       // 3-5 things currently working well
    theChallenge: string[];       // 3-5 key challenges to address
    keyObservation: string;       // single paragraph key insight
    strategicPriorities: string[]; // 3-5 numbered strategic priorities
  };

  presenceAudit: {
    websiteScore: number;         // 1-10
    websiteAssessment: string;    // 1-2 sentence assessment
    seoScore: number;             // 1-10
    seoAssessment: string;
    socialMediaScore: number;     // 1-10
    socialMediaAssessment: string;
    overallAssessment: string;    // overall paragraph assessment
  };

  competitiveLandscape: {
    competitors: Array<{
      name: string;
      positioning: string;        // how they position themselves
      strengths: string[];        // 3-4 strengths
      weaknesses: string[];       // 3-4 weaknesses
      keyTakeaway: string;        // italic takeaway
    }>;                           // 3-4 competitors
    strategicPosition: string;    // where ${companyName} fits
    positioningTakeaways: string[]; // 3-5 key takeaways
  };

  channelStrategyOverview: {
    recommendedChannels: Array<{
      name: string;               // e.g. "LinkedIn Organic", "Google Ads", "Content Marketing"
      fitScore: number;           // 1-10
      rationale: string;          // why this channel fits
    }>;                           // exactly 3 channels
    whyNotOtherChannels: string[]; // 2-4 channels NOT recommended and why
    howChannelsWorkTogether: string; // paragraph about channel synergy
  };

  channelDetails: Array<{
    channelName: string;
    investment: string;           // e.g. "$2,000-3,000/mo" or "10-15 hrs/week"
    timeToResults: string;        // e.g. "4-6 weeks"
    keyMetric: string;            // e.g. "Marketing Qualified Leads"
    strategicRationale: string;   // paragraph explaining why
    keyTactics: string[];         // 5-8 specific tactics
    twelveWeekPlan: Array<{
      week: string;               // e.g. "Weeks 1-2", "Weeks 3-4"
      actions: string[];          // 2-4 specific actions
    }>;                           // 6 entries covering 12 weeks
  }>;                             // exactly 3 channel details (matching the 3 recommended channels)

  executionRoadmap: {
    months: Array<{
      month: string;              // "Month 1", "Month 2", "Month 3"
      theme: string;              // e.g. "Foundation & Quick Wins"
      actions: string[];          // 5-8 specific actions
      checkpoint: string;         // what to evaluate at end of month
    }>;                           // exactly 3 months
  };

  successMetrics: {
    growthTargets: Array<{
      metric: string;             // e.g. "Website Traffic", "LinkedIn Followers"
      current: string;            // current state or "Baseline"
      day30: string;              // 30-day target
      day60: string;              // 60-day target
      day90: string;              // 90-day target
    }>;                           // 5-7 metrics
    trackingNotes: string;        // paragraph about measurement approach
  };

  nextSteps: {
    immediateActions: string[];   // 5-7 things to do this week
    ctaParagraph: string;         // call-to-action paragraph
    mvrxValueProp: string;        // MVRX Labs value proposition paragraph
  };
}

COMPANY DETAILS:
- Company: ${companyName}
- Industry: ${industry}
- Target Audience: ${targetAudience}
- Product/Service: ${productDescription}

CONTENT GUIDELINES:
- Be specific and data-driven. Reference real competitors, real market data, real channel benchmarks.
- Provide actionable tactics, not vague advice. Include specific tools, platforms, and approaches.
- Investment estimates should be realistic for a startup/growing company.
- Growth targets should be ambitious but achievable.
- The 12-week plans should have concrete week-by-week actions.
- Channel recommendations should be tailored to the specific industry and audience, not generic.
- For the next steps section, the mvrxValueProp should mention MVRX Labs' ability to help implement the strategy.

CRITICAL: Your final text response MUST contain the raw JSON object directly.
Do NOT use any tool to save the JSON to a file. Do NOT summarise the results.
Just output the raw JSON object as your final message. No markdown formatting, no code fences, no text before or after — only the JSON.`;

interface GTMStrategyPayload {
  runId: string;
  companyName: string;
  accountName?: string;
  industry: string;
  targetAudience: string;
  productDescription: string;
  model?: string;
}

export const gtmStrategyTask = task({
  id: "gtm-strategy-generation",
  maxDuration: 3600,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: GTMStrategyPayload, { signal }) => {
    const { runId, companyName, accountName, industry, targetAudience, productDescription, model } = payload;

    const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);

    try {
      const totalSteps = 4;
      metadata.set("progress", {
        step: "Preparing research session",
        stepNumber: 1,
        totalSteps,
        percentage: 0,
      });

      await mkdir(sessionDir, { recursive: true });

      const preparedDate = currentMonth();
      const resolvedModel = resolveModel(model, MODEL_MAP.opus);

      metadata.set("progress", {
        step: "Researching & generating strategy",
        stepNumber: 2,
        totalSteps,
        percentage: 10,
      });
      logger.info("Starting GTM strategy generation", { runId, companyName, model: resolvedModel });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";
      const claudeStart = Date.now();

      for await (const message of query({
        prompt: GTM_PROMPT(companyName, industry, targetAudience, productDescription, preparedDate),
        options: {
          model: resolvedModel,
          abortController,
          cwd: sessionDir,
          allowedTools: ["WebSearch", "WebFetch", "Read"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 40,
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

      metadata.set("progress", {
        step: "Building document",
        stepNumber: 3,
        totalSteps,
        percentage: 65,
      });

      const json = extractJSON(output);
      const content: GTMStrategyContent = JSON.parse(json);

      logger.info("Building DOCX");
      const buf = await buildGtmDocx(content);

      metadata.set("progress", {
        step: "Uploading to Google Drive",
        stepNumber: 4,
        totalSteps,
        percentage: 80,
      });

      const rootFolderId = getGeneratedMaterialsFolderId();

      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const filename = `MVRX | ${content.companyName} | GTM Strategy.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, buf, DOCX_MIME, targetFolderId);
      logger.info(`DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(buf.length / 1024).toFixed(0)} KB)`);

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      metadata.set("progress", { step: "Complete", stepNumber: 4, totalSteps, percentage: 100 });
      const outputMessage = `GTM Strategy document saved: ${filename}`;
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
      logger.error(`GTM strategy failed: ${errorMessage}`, { runId });

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "gtm-strategy",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
