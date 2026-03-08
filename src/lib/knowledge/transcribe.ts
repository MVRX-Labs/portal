/**
 * Knowledge Hub — Voice note transcription via OpenAI Whisper API.
 *
 * Downloads voice notes from Slack, sends to Whisper, stores transcript
 * in the event's resolvedContent field.
 */

import { db } from "@/lib/db";
import { knowledgeEvents } from "@/lib/schema";
import { eq, isNull, and } from "drizzle-orm";
import { downloadFile } from "./slack-client";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return key;
}

interface TranscribeResult {
  transcribed: number;
  errors: string[];
}

/**
 * Transcribe all unresolved voice notes for a given channel (or all channels).
 */
export async function transcribeVoiceNotes(
  channelId?: string,
  logger?: { info: (msg: string) => void; error: (msg: string) => void },
): Promise<TranscribeResult> {
  const log = logger ?? { info: console.log, error: console.error };

  // Find voice notes without resolved content
  const conditions = [
    eq(knowledgeEvents.contentType, "voice_note"),
    isNull(knowledgeEvents.resolvedContent),
  ];
  if (channelId) {
    conditions.push(eq(knowledgeEvents.channelId, channelId));
  }

  const events = await db
    .select({
      id: knowledgeEvents.id,
      mediaUrl: knowledgeEvents.mediaUrl,
      authorName: knowledgeEvents.authorName,
      sourceRef: knowledgeEvents.sourceRef,
    })
    .from(knowledgeEvents)
    .where(and(...conditions));

  log.info(`Found ${events.length} voice notes to transcribe`);

  const result: TranscribeResult = { transcribed: 0, errors: [] };

  for (const event of events) {
    if (!event.mediaUrl) {
      result.errors.push(`${event.id}: no media URL`);
      continue;
    }

    try {
      log.info(`Transcribing voice note from ${event.authorName} (${event.id})`);

      // Download from Slack
      const audioBuffer = await downloadFile(event.mediaUrl);

      // Send to Whisper
      const transcript = await whisperTranscribe(audioBuffer, event.sourceRef);

      // Store transcript
      await db
        .update(knowledgeEvents)
        .set({ resolvedContent: transcript })
        .where(eq(knowledgeEvents.id, event.id));

      log.info(`Transcribed ${event.id}: ${transcript.length} chars`);
      result.transcribed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${event.id}: ${msg}`);
      log.error(`Failed to transcribe ${event.id}: ${msg}`);
    }
  }

  return result;
}

/**
 * Call OpenAI Whisper API to transcribe audio.
 */
async function whisperTranscribe(audioBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/m4a" });
  formData.append("file", blob, `${filename}.m4a`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${getOpenAIKey()}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper API ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text.trim();
}
