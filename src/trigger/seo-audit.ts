import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { findOrCreateFolder, getGeneratedMaterialsFolderId, uploadFile } from "@/lib/gdrive";
import { buildSeoAuditDocx } from "@/lib/seo-audit-docx-builder";
import type { SEOAuditContent } from "@/lib/seo-audit-schema";
import { resolveModel, MODEL_MAP, currentMonth, extractJSON } from "@/lib/audit-utils";

function buildAuditCommand(url: string, crawlMode: string, categories?: string, includeCwv?: boolean): string {
  const parts = ["seomator", "audit", url, "--format", "json"];

  if (crawlMode !== "single") {
    parts.push("--crawl");
    const maxPages = crawlMode === "crawl-20" ? 20 : crawlMode === "crawl-50" ? 50 : 100;
    parts.push("-m", String(maxPages));
  }

  if (categories) {
    parts.push("-c", categories);
  }

  if (!includeCwv) {
    parts.push("--no-cwv");
  }

  return parts.join(" ");
}

const SEO_ANALYSIS_PROMPT = (websiteUrl: string, date: string) => `\
You are a senior SEO analyst at MVRX Labs. Your task is to analyse the SEOmator audit results for "${websiteUrl}" and produce a comprehensive SEO audit report.

Read the file "audit-results.json" in this directory. It contains the full audit output from SEOmator covering up to 251 rules across 20 categories.

Analyse the data and produce a **single JSON object** matching this schema:

interface SEOAuditContent {
  websiteUrl: string;           // "${websiteUrl}"
  preparedDate: string;         // "${date}"

  overallScore: {
    score: number;              // 0-100 overall health score
    grade: string;              // A-F letter grade
    summary: string;            // 2-3 sentence executive summary of findings
    pagesAudited: number;       // number of pages in the audit
  };

  categoryBreakdown: Array<{
    category: string;           // category name
    score: number;              // 0-100 category score
    weight: string;             // e.g. "12%"
    passCount: number;
    warnCount: number;
    failCount: number;
    topIssue?: string;          // most impactful issue in this category
  }>;                           // all categories present in the audit, ordered by weight

  criticalIssues: Array<{
    severity: "fail" | "warn";
    category: string;
    rule: string;               // rule name/id
    description: string;        // what the issue is
    affectedUrls: string[];     // list of affected page URLs
    fixRecommendation: string;  // actionable fix instruction
  }>;                           // all fail issues first, then warn issues, max 25

  strengthsAndWins: string[];   // 5-8 things the site does well (passes)

  prioritizedActionPlan: Array<{
    priority: number;           // 1-based priority order
    category: string;
    action: string;             // specific action to take
    expectedImpact: string;     // what improvement to expect
    effort: "low" | "medium" | "high";
  }>;                           // 8-15 prioritised actions, highest impact first

  nextSteps: {
    immediateActions: string[]; // 3-5 things to do this week
    shortTermActions: string[]; // 3-5 things to do this month
    longTermActions: string[];  // 3-5 things to do over 2-3 months
    ctaParagraph: string;       // call-to-action paragraph
    mvrxValueProp: string;      // MVRX Labs value proposition for implementation help
  };
}

ANALYSIS GUIDELINES:
- Base scores and grades on the actual audit data. Do NOT fabricate or estimate.
- For category weights, use standard SEO priority: Core (12%), Performance (12%), Links (8%), Images (8%), Security (8%), Technical SEO (7%), Crawlability (5%), Structured Data (5%), JS Rendering (5%), Content (5%), Accessibility (4%), Social (3%), E-E-A-T (3%), URL Structure (3%), Redirects (3%), Mobile (2%), Internationalization (2%), HTML Validation (2%), AI/GEO Readiness (2%), Legal Compliance (1%).
- Prioritise fixes by severity (fails before warns) and category weight.
- Be specific in fix recommendations — reference actual URLs and rules from the data.
- For the action plan, group related fixes where possible and estimate effort realistically.
- The mvrxValueProp should mention MVRX Labs' ability to implement SEO fixes and monitor improvements.

CRITICAL: Your final text response MUST contain the raw JSON object directly.
Do NOT use any tool to save the JSON to a file. Do NOT summarise the results.
Just output the raw JSON object as your final message. No markdown formatting, no code fences, no text before or after — only the JSON.`;

interface SeoAuditPayload {
  runId: string;
  websiteUrl: string;
  crawlMode: string;
  categories?: string;
  includeCwv?: boolean;
  accountName?: string;
  model?: string;
}

export const seoAuditTask = task({
  id: "seo-audit-generation",
  maxDuration: 3600,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: SeoAuditPayload, { signal }) => {
    const { runId, websiteUrl, crawlMode, categories, includeCwv, accountName, model } = payload;

    const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);

    try {
      const totalSteps = 5;
      metadata.set("progress", { step: "Preparing audit", stepNumber: 1, totalSteps, percentage: 0 });

      await mkdir(sessionDir, { recursive: true });

      // Initialise seomator config in session directory
      logger.info("Initialising seomator config", { sessionDir });
      execSync("seomator init -y", { cwd: sessionDir, timeout: 30000, stdio: "pipe" });

      metadata.set("progress", { step: "Running SEO audit", stepNumber: 2, totalSteps, percentage: 10 });

      // Run the seomator audit
      const auditCmd = buildAuditCommand(websiteUrl, crawlMode, categories, includeCwv);
      const outputPath = join(sessionDir, "audit-results.json");
      const fullCmd = `${auditCmd} -o ${outputPath}`;

      logger.info("Running seomator audit", { command: fullCmd, runId });
      const auditTimeout = crawlMode === "crawl-100" ? 600000 : crawlMode === "crawl-50" ? 300000 : 120000;
      const auditOutput = execSync(fullCmd, { cwd: sessionDir, timeout: auditTimeout, stdio: "pipe", maxBuffer: 50 * 1024 * 1024 });
      logger.info(`Seomator audit complete: ${auditOutput.toString().slice(0, 200)}`);

      metadata.set("progress", { step: "Analysing audit results", stepNumber: 3, totalSteps, percentage: 35 });

      const preparedDate = currentMonth();
      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);

      logger.info("Starting Claude analysis", { runId, websiteUrl, model: resolvedModel });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";
      const claudeStart = Date.now();

      for await (const message of query({
        prompt: SEO_ANALYSIS_PROMPT(websiteUrl, preparedDate),
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

      metadata.set("progress", { step: "Building document", stepNumber: 4, totalSteps, percentage: 70 });

      const json = extractJSON(output);
      const content: SEOAuditContent = JSON.parse(json);

      logger.info("Building DOCX");
      const buf = await buildSeoAuditDocx(content);

      metadata.set("progress", { step: "Uploading to Google Drive", stepNumber: 5, totalSteps, percentage: 85 });

      const rootFolderId = getGeneratedMaterialsFolderId();
      let targetFolderId = rootFolderId;
      if (accountName) {
        targetFolderId = await findOrCreateFolder(accountName, rootFolderId);
      }

      const urlHost = new URL(websiteUrl).hostname;
      const filename = `MVRX | ${urlHost} | SEO Audit.docx`;
      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const driveFile = await uploadFile(filename, buf, DOCX_MIME, targetFolderId);
      logger.info(`DOCX uploaded to Google Drive: ${driveFile.webViewLink} (${(buf.length / 1024).toFixed(0)} KB)`);

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      metadata.set("progress", { step: "Complete", stepNumber: 5, totalSteps, percentage: 100 });
      const outputMessage = `SEO Audit document saved: ${filename}`;
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
      logger.error(`SEO audit failed: ${errorMessage}`, { runId });

      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "seo-audit",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
