import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns, accounts, contacts, linkedinProfiles } from "@/lib/schema";
import { runClaudeAgent } from "@/lib/claude-agent";
import { extractJSON, resolveModel, MODEL_MAP } from "@/lib/audit-utils";
import { uploadFile, findOrCreateFolder, getGeneratedMaterialsFolderId } from "@/lib/gdrive";
import { sendSlackNotification } from "@/lib/slack";
import { buildGenerationPrompt } from "@/lib/outbound-sequence/generation-prompt";
import { buildReviewPrompt } from "@/lib/outbound-sequence/review-prompt";
import { buildOutboundSequenceDocx } from "@/lib/outbound-sequence/builder";
import type { OutboundSequenceContent } from "@/lib/outbound-sequence/schema";

interface OutboundSequencePayload {
  runId: string;
  accountId: string;
  senderContactId?: string;
  targetIcp: string;
  valueProp: string;
  toneNotes?: string;
  audienceSegments?: string;
  leadListDescription?: string;
  senderAccountCount?: number;
  model?: string;
}

const TOTAL_STEPS = 5;

function progress(step: string, num: number) {
  const pct = Math.round((num / TOTAL_STEPS) * 100);
  metadata.set("progress", { step, stepNumber: num, totalSteps: TOTAL_STEPS, percentage: pct });
  logger.info(`Step ${num}/${TOTAL_STEPS}: ${step}`);
}

export const outboundSequenceTask = task({
  id: "outbound-sequence-generation",
  maxDuration: 3600,
  retry: { maxAttempts: 2, minTimeoutInMs: 5000 },

  run: async (payload: OutboundSequencePayload) => {
    const { runId, accountId, targetIcp, valueProp, toneNotes } = payload;
    const sessionDir = join(tmpdir(), `outbound-seq-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });

    try {
      // --- Step 1: Load sender + account context ---
      progress("Loading sender and account data", 1);

      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!account) throw new Error(`Account ${accountId} not found`);

      // Load sender contact (if specified) or use first contact with a LinkedIn profile
      let senderName = account.name;
      let senderRole: string | undefined;
      let senderLinkedinHeadline: string | undefined;
      let senderLinkedinAbout: string | undefined;

      if (payload.senderContactId) {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, payload.senderContactId));
        if (contact) {
          senderName = contact.name;
        }

        // Get LinkedIn profile for the sender
        const [profile] = await db
          .select()
          .from(linkedinProfiles)
          .where(eq(linkedinProfiles.contactId, payload.senderContactId));
        if (profile) {
          senderLinkedinHeadline = profile.displayName || undefined;
        }
      }

      logger.info("Context loaded", {
        account: account.name,
        sender: senderName,
        targetIcp,
      });

      // --- Step 2: Research ICP and industry ---
      progress("Researching ICP and industry context", 2);

      const researchPrompt = `You are a B2B sales researcher. Research the following ICP (Ideal Customer Profile) and their industry to provide context for writing LinkedIn outbound messages.

ICP: ${targetIcp}
Sender's company: ${account.name}
${account.industry ? `Sender's industry: ${account.industry}` : ""}
${account.website ? `Sender's website: ${account.website}` : ""}
Value proposition: ${valueProp}

Research and return a JSON object with:
1. "icpChallenges": Top 5-7 specific challenges this ICP faces right now (be specific, not generic)
2. "industryTrends": 3-5 current trends or shifts in their industry that are relevant
3. "commonObjections": 3-5 common objections this ICP would have to outreach
4. "conversationStarters": 5-7 specific topics/hooks that would resonate with this ICP
5. "relevantContent": 3-5 types of content or resources that would be genuinely valuable to share
6. "competitiveLandscape": Brief overview of what solutions this ICP is likely already using or evaluating

Return ONLY a JSON object. No explanation.`;

      const researchResult = await runClaudeAgent(researchPrompt, sessionDir, {
        allowedTools: ["WebSearch", "WebFetch"],
        maxTurns: 25,
        model: MODEL_MAP.sonnet,
      });

      logger.info("Research complete", {
        costUsd: researchResult.costUsd.toFixed(4),
        turns: researchResult.turns,
      });

      const researchJson = extractJSON(researchResult.output);
      await writeFile(join(sessionDir, "icp-research.json"), researchJson);

      // Also write sender context for the generation agent to read
      const senderContext = {
        senderName,
        senderOrg: account.name,
        senderRole,
        senderLinkedinHeadline,
        senderLinkedinAbout,
        accountWebsite: account.website,
        accountIndustry: account.industry,
        targetIcp,
        valueProp,
        toneNotes,
      };
      await writeFile(join(sessionDir, "sender-context.json"), JSON.stringify(senderContext, null, 2));

      // --- Step 3: Generate sequences ---
      progress("Generating outbound sequences", 3);

      const resolvedModel = resolveModel(payload.model, MODEL_MAP.opus);
      // Parse audience segments from newline-separated string
      const audienceSegments = payload.audienceSegments
        ? payload.audienceSegments
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      const generationPrompt = buildGenerationPrompt({
        senderName,
        senderOrg: account.name,
        senderRole,
        senderLinkedinHeadline,
        senderLinkedinAbout,
        accountName: account.name,
        accountWebsite: account.website || undefined,
        accountIndustry: account.industry || undefined,
        targetIcp,
        valueProp,
        toneNotes,
        audienceSegments,
        leadListSummary: payload.leadListDescription,
        senderAccountCount: payload.senderAccountCount,
      });

      const genResult = await runClaudeAgent(generationPrompt, sessionDir, {
        allowedTools: ["Read", "Glob"],
        maxTurns: 30,
        model: resolvedModel,
      });

      logger.info("Generation complete", {
        costUsd: genResult.costUsd.toFixed(4),
        turns: genResult.turns,
      });

      const rawJson = extractJSON(genResult.output);
      let sequenceContent = JSON.parse(rawJson) as OutboundSequenceContent;

      // --- Step 4: Review and quality check ---
      progress("Reviewing sequence quality", 4);

      await writeFile(join(sessionDir, "report.json"), JSON.stringify(sequenceContent, null, 2));

      const reviewPrompt = buildReviewPrompt(senderName);
      const reviewModel = resolveModel(payload.model, MODEL_MAP.sonnet ?? MODEL_MAP.opus);

      const reviewResult = await runClaudeAgent(reviewPrompt, sessionDir, {
        allowedTools: ["Read", "Glob"],
        maxTurns: 25,
        model: reviewModel,
      });

      logger.info("Review complete", {
        costUsd: reviewResult.costUsd.toFixed(4),
        turns: reviewResult.turns,
      });

      try {
        const reviewedJson = extractJSON(reviewResult.output);
        const reviewed = JSON.parse(reviewedJson) as OutboundSequenceContent;
        // Sanity check: make sure the reviewed version has core fields
        if (reviewed.sequences?.length >= 1 && reviewed.senderName && reviewed.targetIcp) {
          sequenceContent = reviewed;
          logger.info("Review applied — sequences cleaned up");
        } else {
          logger.warn("Review output missing core fields, using original generation");
        }
      } catch (reviewErr) {
        logger.warn("Review parsing failed, using original generation", {
          error: reviewErr instanceof Error ? reviewErr.message : String(reviewErr),
        });
      }

      // --- Step 5: Build DOCX and upload ---
      progress("Building document and uploading", 5);

      const docxBuffer = await buildOutboundSequenceDocx(sequenceContent);
      const filename = `MVRX | ${account.name} | LinkedIn Outbound Sequence Playbook.docx`;

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
          output: `Outbound sequences saved: ${filename}`,
          outputUrl: driveFile.webViewLink || null,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      return { success: true, filename, driveUrl: driveFile.webViewLink };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Outbound sequence failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "outbound-sequence",
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
