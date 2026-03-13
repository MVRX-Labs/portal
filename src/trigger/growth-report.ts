import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns, accounts, contacts, linkedinProfiles } from "@/lib/schema";
import { getAccountCompanyLinkedinUrl } from "@/lib/linkedin-profiles";
import { runClaudeAgent } from "@/lib/claude-agent";
import { extractJSON, resolveModel, MODEL_MAP } from "@/lib/audit-utils";
import { uploadFile, findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { sendSlackNotification } from "@/lib/slack";
import { runDiscovery } from "@/lib/growth-report/discovery";
import { collectAllData } from "@/lib/growth-report/scrapers";
import { buildAnalysisPrompt } from "@/lib/growth-report/analysis-prompt";
import { buildReviewPrompt } from "@/lib/growth-report/review-prompt";
import { buildGrowthReportDocx } from "@/lib/growth-report/builder";
import { MVRX_CASE_STUDIES, STANDARD_PRICING } from "@/lib/growth-report/constants";
import type { GrowthReportContent } from "@/lib/growth-report/schema";

interface GrowthReportPayload {
  runId: string;
  accountId: string;
  model?: string;
}

const TOTAL_STEPS = 6;

function progress(step: string, num: number) {
  const pct = Math.round((num / TOTAL_STEPS) * 100);
  metadata.set("progress", { step, stepNumber: num, totalSteps: TOTAL_STEPS, percentage: pct });
  logger.info(`Step ${num}/${TOTAL_STEPS}: ${step}`);
}

export const growthReportTask = task({
  id: "growth-report-generation",
  maxDuration: 3600,
  retry: { maxAttempts: 2, minTimeoutInMs: 5000 },

  run: async (payload: GrowthReportPayload) => {
    const { runId, accountId } = payload;
    const sessionDir = join(tmpdir(), `growth-report-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });

    try {
      // --- Step 1: Load account data ---
      progress("Loading account data", 1);

      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!account) throw new Error(`Account ${accountId} not found`);
      if (!account.website) throw new Error(`Account ${accountId} has no website`);

      const accountContacts = await db.select().from(contacts).where(eq(contacts.accountId, accountId));

      // Look up LinkedIn URLs from linkedin_profiles
      const contactProfiles = await db
        .select({ contactId: linkedinProfiles.contactId, linkedinUrl: linkedinProfiles.linkedinUrl })
        .from(linkedinProfiles)
        .where(eq(linkedinProfiles.accountId, accountId));
      const urlByContactId = new Map(
        contactProfiles.filter((p) => p.contactId).map((p) => [p.contactId, p.linkedinUrl])
      );
      const linkedinContacts = accountContacts
        .map((c) => ({ ...c, linkedinUrl: urlByContactId.get(c.id) ?? null }))
        .filter((c) => c.linkedinUrl);

      logger.info("Account loaded", {
        name: account.name,
        website: account.website,
        contacts: linkedinContacts.length,
      });

      // --- Step 2: Discovery ---
      progress("Researching competitors & social presence", 2);

      const discovery = await runDiscovery(account.website, account.name, account.industry);

      await writeFile(join(sessionDir, "research.json"), JSON.stringify(discovery, null, 2));

      // --- Step 3: Data collection ---
      progress("Collecting data from 12+ sources", 3);

      const scraped = await collectAllData({
        websiteUrl: account.website,
        companyName: account.name,
        companyLinkedinUrl: await getAccountCompanyLinkedinUrl(accountId),
        contacts: linkedinContacts.map((c) => ({ name: c.name, linkedinUrl: c.linkedinUrl! })),
        discovery,
      });

      if (scraped.failures.length > 0) {
        logger.warn("Scrapers with failures", {
          count: scraped.failures.length,
          failures: scraped.failures,
        });
      }

      // Write all data to session dir for Claude
      const files: [string, unknown][] = [
        ["discovery.json", discovery],
        ["similarweb.json", scraped.similarweb],
        ["ahrefs.json", scraped.ahrefs],
        ["seo-audit.json", scraped.seoAudit],
        ["linkedin-company.json", scraped.linkedinCompany],
        ["instagram.json", scraped.instagram],
        ["tiktok.json", scraped.tiktok],
        ["ai-visibility.json", scraped.aiVisibility],
        ["serp-results.json", scraped.serpResults],
        ["trustpilot.json", scraped.trustpilot],
        ["reddit.json", scraped.reddit],
        ["failures.json", scraped.failures],
      ];

      for (const person of scraped.linkedinPeople) {
        const slug = person.name.toLowerCase().replace(/\s+/g, "-");
        files.push([`linkedin-${slug}.json`, person.data]);
      }

      await Promise.all(
        files
          .filter(([, d]) => d != null)
          .map(([name, data]) => writeFile(join(sessionDir, name), JSON.stringify(data, null, 2)))
      );

      // --- Step 4: Claude analysis ---
      progress("AI analysis — generating report content", 4);

      const preparedDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const resolvedModel = resolveModel(payload.model, MODEL_MAP.opus);
      const prompt = buildAnalysisPrompt(account.website, account.name, preparedDate);

      const analysisResult = await runClaudeAgent(prompt, sessionDir, {
        allowedTools: ["Read", "Glob"],
        maxTurns: 30,
        model: resolvedModel,
      });

      logger.info("Analysis complete", {
        costUsd: analysisResult.costUsd.toFixed(4),
        turns: analysisResult.turns,
      });

      const rawJson = extractJSON(analysisResult.output);
      let reportContent = JSON.parse(rawJson) as GrowthReportContent;

      // Inject hardcoded sections
      reportContent.caseStudies = MVRX_CASE_STUDIES;
      reportContent.statementOfWork = reportContent.statementOfWork || buildDefaultSow();
      reportContent.pricing = reportContent.pricing || buildDefaultPricing();

      // --- Step 5: Initial build & review ---
      progress("Building initial document & running quality review", 5);

      // Build the initial docx so we know the document is structurally valid
      await buildGrowthReportDocx(reportContent);

      // Write report JSON for the review agent to read
      await writeFile(join(sessionDir, "report.json"), JSON.stringify(reportContent, null, 2));

      const reviewPrompt = buildReviewPrompt(account.name);
      const reviewModel = resolveModel(payload.model, MODEL_MAP.sonnet ?? MODEL_MAP.opus);

      const reviewResult = await runClaudeAgent(reviewPrompt, sessionDir, {
        allowedTools: ["Read", "Glob"],
        maxTurns: 20,
        model: reviewModel,
      });

      logger.info("Review complete", {
        costUsd: reviewResult.costUsd.toFixed(4),
        turns: reviewResult.turns,
      });

      try {
        const reviewedJson = extractJSON(reviewResult.output);
        const reviewed = JSON.parse(reviewedJson) as GrowthReportContent;
        // Sanity check: make sure the reviewed version has core fields
        if (reviewed.companyName && reviewed.executiveSummary && reviewed.keyMetrics) {
          reportContent = reviewed;
          // Re-inject hardcoded sections in case the review agent dropped them
          reportContent.caseStudies = MVRX_CASE_STUDIES;
          reportContent.statementOfWork = reportContent.statementOfWork || buildDefaultSow();
          reportContent.pricing = reportContent.pricing || buildDefaultPricing();
          logger.info("Review applied — report cleaned up");
        } else {
          logger.warn("Review output missing core fields, using original analysis");
        }
      } catch (reviewErr) {
        logger.warn("Review parsing failed, using original analysis", {
          error: reviewErr instanceof Error ? reviewErr.message : String(reviewErr),
        });
      }

      // --- Step 6: Final build & upload ---
      progress("Building final document & uploading", 6);

      const docxBuffer = await buildGrowthReportDocx(reportContent);
      const hostname = new URL(account.website.startsWith("http") ? account.website : `https://${account.website}`)
        .hostname;
      const filename = `MVRX | ${hostname} | Complete SEO & Growth Report.docx`;

      const parentFolder = getGeneratedMaterialsFolderId();
      const accountFolder = account.name ? await findOrCreateFolder(account.name, parentFolder) : parentFolder;

      const driveFile = await uploadFile(
        filename,
        docxBuffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        accountFolder
      );

      logger.info("Uploaded to Google Drive", { filename, webViewLink: driveFile.webViewLink });

      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: `Growth report saved: ${filename}`,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      return { success: true, filename, driveUrl: driveFile.webViewLink };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Growth report failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "growth-report",
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

function buildDefaultSow(): GrowthReportContent["statementOfWork"] {
  return {
    scopeDescription: "MVRX Labs will provide end-to-end SEO and growth execution across three workstreams:",
    workstreams: [
      "Technical SEO and Site Optimisation: Heading fixes, schema, broken URLs, meta descriptions, alt text, AI bot policy, product page standardisation.",
      "Content and Channel Strategy: LinkedIn ghostwriting for founders, SEO blog content, social SEO activation, Reddit community building.",
      "Authority and Visibility: Dofollow link building, Google Brand Profile, entity data cleanup, Share of Model tracking, competitive benchmarking.",
    ],
    deliverables: [
      { deliverable: "Technical SEO roadmap", frequency: "One-off (Week 1-2)", format: "Doc with ticket specs" },
      { deliverable: "Schema markup templates", frequency: "One-off (Sprint 1)", format: "Code files" },
      { deliverable: "llms.txt + robots.txt", frequency: "One-off (Week 1)", format: "Plain text files" },
      {
        deliverable: "LinkedIn content (founders)",
        frequency: "3-4 posts/week per person",
        format: "Drafts for review",
      },
      { deliverable: "SEO blog articles", frequency: "2-4 per month", format: "3,000+ word articles" },
      { deliverable: "Link building outreach", frequency: "Ongoing", format: "25+ new domains/quarter" },
      { deliverable: "Monthly performance report", frequency: "Monthly", format: "Traffic, DR, rankings" },
      { deliverable: "Quarterly competitor benchmark", frequency: "Quarterly", format: "Full refresh" },
    ],
    timeline: [
      {
        phase: "Phase 1: Foundation",
        timing: "Weeks 1-2",
        milestones: "Quick wins deployed. llms.txt live. Broken URLs redirected. LinkedIn started.",
      },
      {
        phase: "Phase 2: Infrastructure",
        timing: "Weeks 3-6",
        milestones: "Schema live. Stockist outreach started. First blog articles published.",
      },
      {
        phase: "Phase 3: Scale",
        timing: "Weeks 7-12",
        milestones: "Full LinkedIn cadence. 6-8 blog articles. 25+ new referring domains.",
      },
      {
        phase: "Phase 4: Optimise",
        timing: "Months 4-6",
        milestones: "Product page standardisation. SoM tracking. Social activation.",
      },
      {
        phase: "Phase 5: Expand",
        timing: "Months 7-12",
        milestones: "International SEO. Accessibility audit. Sustained link building.",
      },
    ],
  };
}

function buildDefaultPricing(): GrowthReportContent["pricing"] {
  const c = STANDARD_PRICING.components;
  return {
    introduction: "Three engagement options, scaled by scope and commitment.",
    options: [
      {
        name: "Option A: Full Execution",
        description:
          "MVRX Labs handles all initiatives end-to-end. Client provides engineering support and editorial sign-off.",
        components: [c.techSeo, c.linkedin, c.blogContent, c.linkBuilding, c.socialReddit, c.reporting],
        total: "\u00a39,000/month",
        note: "No minimum commitment. SEO takes 3+ months to show results; we recommend 6 months. 10% discount on 12-month agreements.",
      },
      {
        name: "Option B: Strategy + Content",
        description: "MVRX Labs handles content and strategic direction. Client executes technical SEO internally.",
        components: [c.linkedin, c.blogContent, c.socialReddit, c.reportDirection],
        total: "\u00a36,250/month",
        note: "No minimum commitment. We recommend at least 3 months for meaningful results.",
      },
      {
        name: "Option C: Advisory + Audit",
        description: "MVRX Labs provides strategic oversight and monthly audits. Client executes all workstreams.",
        components: [c.monthlyAudit, c.competitorBench, c.advisory, c.quarterlyDeep],
        total: "\u00a33,000/month",
        note: "No minimum commitment. We recommend at least 3 months.",
      },
    ],
    exclusions: [...STANDARD_PRICING.exclusions],
  };
}
