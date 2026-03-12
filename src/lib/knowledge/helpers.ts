/**
 * Knowledge Hub — shared helpers for ingestion and normalisation.
 */

import type { SlackMessage, SlackUser } from "./types";

export const URL_PATTERN = /https?:\/\/[^\s<>|]+/g;
export const DRIVE_PATTERN = /https?:\/\/(?:docs|drive)\.google\.com\/[^\s<>|]+/g;

/** Create a fresh drive link regex (avoids stateful lastIndex issues with global regexes). */
export function makeDrivePattern(): RegExp {
  return /https?:\/\/(?:docs|drive)\.google\.com\/[^\s<>|]+/g;
}

/** System subtypes we skip entirely during ingestion. */
export const SKIP_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
]);

/** Known MVRX team IDs. Add more as discovered. */
const MVRX_TEAM_IDS = new Set([
  "T07LGKRJ2AC", // MVRX Labs primary
  "T0A72PKB8R2", // MVRX secondary
]);

export function classifyUserSide(user: { teamId: string; email?: string }): "mvrx" | "client" {
  if (MVRX_TEAM_IDS.has(user.teamId)) return "mvrx";
  if (user.email?.endsWith("@mvrxlabs.com")) return "mvrx";
  return "client";
}

export function cleanSlackUrl(url: string): string {
  return url.replace(/[<>]/g, "").split("|")[0];
}

export function detectContentType(msg: SlackMessage): string {
  if (msg.files?.length) {
    const file = msg.files[0];
    if (file.filetype === "m4a" || file.mimetype?.startsWith("audio/")) return "voice_note";
    if (file.mimetype?.startsWith("image/")) return "image";
    if (file.mimetype?.startsWith("video/")) return "video";
    if (file.filetype === "pdf") return "pdf";
    if (file.filetype === "gdoc") return "gdoc";
    if (file.filetype === "gsheet") return "gsheet";
    if (file.filetype === "gpres") return "gpres";
  }
  return "text";
}

export function buildMetadata(msg: SlackMessage): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (msg.reply_count) meta.replyCount = msg.reply_count;
  if (msg.reactions?.length) {
    meta.reactions = msg.reactions.map((r) => ({ name: r.name, count: r.count }));
  }
  if (msg.files?.length) {
    meta.files = msg.files.map((f) => ({
      id: f.id,
      name: f.name,
      filetype: f.filetype,
      size: f.size,
    }));
  }
  if (msg.subtype) meta.subtype = msg.subtype;
  return meta;
}

export function extractLinks(text: string, attachments?: SlackMessage["attachments"]): {
  allLinks: string[];
  driveLinks: string[];
} {
  const allLinks = text.match(URL_PATTERN)?.map(cleanSlackUrl) ?? [];
  const driveLinks = text.match(DRIVE_PATTERN)?.map(cleanSlackUrl) ?? [];

  for (const att of attachments ?? []) {
    if (att.title_link) {
      const cleaned = cleanSlackUrl(att.title_link);
      if (!allLinks.includes(cleaned)) allLinks.push(cleaned);
      // Use fresh regex to avoid stateful lastIndex bug with global /g flag
      if (makeDrivePattern().test(att.title_link) && !driveLinks.includes(cleaned)) {
        driveLinks.push(cleaned);
      }
    }
  }

  return { allLinks, driveLinks };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Escape user-generated content for safe embedding inside Slack mrkdwn formatting.
 * Prevents the user's text from accidentally breaking surrounding bold/italic/strikethrough etc.
 */
export function escapeSlackMrkdwn(text: string): string {
  return text
    .replace(/~/g, "\\~")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/>/g, "&gt;");
}
