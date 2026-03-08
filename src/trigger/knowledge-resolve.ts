/**
 * Knowledge Hub — Media Resolution Task
 *
 * Resolves unprocessed media in knowledge events:
 * 1. Voice notes → OpenAI Whisper transcription
 * 2. Drive links → Google Docs/Sheets content fetch
 *
 * Runs after ingestion, before normalisation.
 * Can be triggered on-demand or chained from the ingest task.
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { transcribeVoiceNotes } from "@/lib/knowledge/transcribe";
import { resolveDriveLinks } from "@/lib/knowledge/drive-resolver";
import { sendSlackNotification } from "@/lib/slack";

export const knowledgeResolveMedia = task({
  id: "knowledge-resolve-media",
  maxDuration: 600, // 10 min — voice transcription can be slow
  retry: { maxAttempts: 2 },
  run: async (payload: { channelId?: string }, { ctx }) => {
    logger.info(`Resolving media${payload.channelId ? ` for channel ${payload.channelId}` : " (all channels)"}`);

    try {
      // 1. Transcribe voice notes
      logger.info("Phase 1: Voice note transcription");
      const transcribeResult = await transcribeVoiceNotes(payload.channelId, logger);
      logger.info(`Transcribed ${transcribeResult.transcribed} voice notes, ${transcribeResult.errors.length} errors`);

      // 2. Resolve Drive links
      logger.info("Phase 2: Drive link resolution");
      const driveResult = await resolveDriveLinks(payload.channelId, logger);
      logger.info(`Resolved ${driveResult.resolved} Drive links, ${driveResult.errors.length} errors`);

      const totalErrors = transcribeResult.errors.length + driveResult.errors.length;
      if (totalErrors > 0) {
        const errorSummary = [
          ...transcribeResult.errors.map((e) => `whisper: ${e}`),
          ...driveResult.errors.map((e) => `drive: ${e}`),
        ]
          .join("; ")
          .slice(0, 500);

        await sendSlackNotification({
          tool: "knowledge-resolve-media",
          userName: "system",
          error: `Partial failure (${totalErrors} errors): ${errorSummary}`,
          runId: ctx.run.id,
        });
      }

      return {
        voiceNotes: transcribeResult,
        driveLinks: driveResult,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "knowledge-resolve-media",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
