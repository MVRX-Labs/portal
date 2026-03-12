/**
 * Knowledge Hub — Google Drive link resolution.
 *
 * Extracts document IDs from Drive URLs, fetches content via the
 * Google Docs/Sheets/Drive API, and stores text in resolvedContent.
 *
 * Uses the existing Google service account from src/lib/google-auth.ts.
 */

import { db } from "@/lib/db";
import { knowledgeEvents } from "@/lib/schema";
import { eq, isNull, and, sql } from "drizzle-orm";
import { getGoogleAccessToken } from "@/lib/google-auth";

const DOCS_EXPORT_URL = "https://docs.googleapis.com/v1/documents";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_EXPORT_URL = "https://www.googleapis.com/drive/v3/files";

/** Extract Google Drive/Docs file ID from a URL. */
export function extractDriveFileId(url: string): string | null {
  // docs.google.com/document/d/FILE_ID/...
  // docs.google.com/spreadsheets/d/FILE_ID/...
  // drive.google.com/file/d/FILE_ID/...
  // drive.google.com/open?id=FILE_ID
  const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch) return dMatch[1];

  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  return null;
}

/** Determine doc type from URL. */
function detectDocType(url: string): "doc" | "sheet" | "slides" | "file" {
  if (url.includes("/document/")) return "doc";
  if (url.includes("/spreadsheets/")) return "sheet";
  if (url.includes("/presentation/")) return "slides";
  return "file";
}

interface ResolveResult {
  resolved: number;
  errors: string[];
}

/**
 * Resolve all unresolved Drive links across knowledge events.
 */
export async function resolveDriveLinks(
  channelId: string | undefined,
  logger: { info: (msg: string) => void; error: (msg: string) => void },
): Promise<ResolveResult> {
  const log = logger;

  // Find events with drive links but no resolved content
  const conditions = [
    sql`jsonb_array_length(${knowledgeEvents.driveLinks}) > 0`,
    isNull(knowledgeEvents.resolvedContent),
  ];
  if (channelId) {
    conditions.push(eq(knowledgeEvents.channelId, channelId));
  }

  const events = await db
    .select({
      id: knowledgeEvents.id,
      driveLinks: knowledgeEvents.driveLinks,
      authorName: knowledgeEvents.authorName,
    })
    .from(knowledgeEvents)
    .where(and(...conditions));

  log.info(`Found ${events.length} events with unresolved Drive links`);

  const result: ResolveResult = { resolved: 0, errors: [] };
  const token = await getGoogleAccessToken({ scope: "https://www.googleapis.com/auth/drive.readonly" });

  for (const event of events) {
    const links = (event.driveLinks as string[]) ?? [];
    const resolvedParts: string[] = [];

    for (const url of links) {
      try {
        const fileId = extractDriveFileId(url);
        if (!fileId) {
          resolvedParts.push(`[Could not parse Drive URL: ${url}]`);
          continue;
        }

        const docType = detectDocType(url);
        const content = await fetchDocContent(fileId, docType, token);
        if (content) {
          resolvedParts.push(content);
        } else {
          resolvedParts.push(`[Empty or inaccessible document: ${url}]`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resolvedParts.push(`[Failed to fetch: ${msg}]`);
        log.error(`Drive fetch failed for ${url}: ${msg}`);
      }
    }

    // Only store resolvedContent if at least one link resolved with real content.
    // Error placeholders (e.g. "[Failed to fetch: ...]") should not count —
    // leaving resolvedContent null allows the next run to retry.
    const successParts = resolvedParts.filter((p) => !p.startsWith("["));
    if (successParts.length > 0) {
      const combined = resolvedParts.join("\n\n---\n\n").slice(0, 10_000);

      await db
        .update(knowledgeEvents)
        .set({ resolvedContent: combined })
        .where(eq(knowledgeEvents.id, event.id));

      result.resolved++;
      log.info(`Resolved ${successParts.length}/${links.length} Drive link(s) for event ${event.id} (${event.authorName})`);
    } else if (resolvedParts.length > 0) {
      log.error(`All ${links.length} Drive link(s) failed for event ${event.id} — will retry next run`);
      result.errors.push(`${event.id}: all ${links.length} links failed`);
    }
  }

  return result;
}

/** Fetch document content based on type. */
async function fetchDocContent(fileId: string, docType: string, token: string): Promise<string | null> {
  switch (docType) {
    case "doc":
      return fetchGoogleDoc(fileId, token);
    case "sheet":
      return fetchGoogleSheet(fileId, token);
    default:
      return fetchDriveFileAsText(fileId, token);
  }
}

/** Fetch Google Doc content as plain text. */
async function fetchGoogleDoc(docId: string, token: string): Promise<string | null> {
  const res = await fetch(`${DOCS_EXPORT_URL}/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Docs API ${res.status}: ${await res.text()}`);

  const doc = await res.json();
  // Extract text from the document body
  return extractTextFromDoc(doc);
}

/** Extract plain text from a Google Docs API response. */
function extractTextFromDoc(doc: Record<string, unknown>): string {
  const body = doc.body as { content?: Array<Record<string, unknown>> } | undefined;
  if (!body?.content) return "";

  const parts: string[] = [];
  for (const element of body.content) {
    const paragraph = element.paragraph as { elements?: Array<Record<string, unknown>> } | undefined;
    if (paragraph?.elements) {
      for (const el of paragraph.elements) {
        const textRun = el.textRun as { content?: string } | undefined;
        if (textRun?.content) parts.push(textRun.content);
      }
    }
  }
  return parts.join("").trim();
}

/** Fetch Google Sheet as readable text (first sheet, values only). */
async function fetchGoogleSheet(sheetId: string, token: string): Promise<string | null> {
  const res = await fetch(`${SHEETS_API_URL}/${sheetId}/values/A:Z?majorDimension=ROWS`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const rows = data.values as string[][] | undefined;
  if (!rows?.length) return null;

  return rows.map((row: string[]) => row.join(" | ")).join("\n");
}

/** Fallback: export any Drive file as plain text. */
async function fetchDriveFileAsText(fileId: string, token: string): Promise<string | null> {
  const res = await fetch(`${DRIVE_EXPORT_URL}/${fileId}/export?mimeType=text/plain`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // If export fails, try getting file metadata at least
    const metaRes = await fetch(`${DRIVE_EXPORT_URL}/${fileId}?fields=name,mimeType`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      return `[File: ${meta.name} (${meta.mimeType}) — content not extractable]`;
    }
    throw new Error(`Drive export ${res.status}, metadata fallback ${metaRes.status}`);
  }

  return (await res.text()).trim();
}
