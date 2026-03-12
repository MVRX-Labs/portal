/**
 * Knowledge Hub — Slack ingestion logic.
 *
 * Pulls messages from registered channels, resolves users + media,
 * extracts links, and stores raw events in the database.
 */

import { db } from "@/lib/db";
import { knowledgeChannels, knowledgeEvents, knowledgeSyncState } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { fetchChannelHistory, fetchThreadReplies, resolveUser, clearUserCache } from "./slack-client";
import { SKIP_SUBTYPES, classifyUserSide, detectContentType, extractLinks, buildMetadata, sleep } from "./helpers";
import type { SlackMessage, Visibility } from "./types";

interface IngestResult {
  channelName: string;
  newMessages: number;
  newThreadReplies: number;
  skipped: number;
  errors: string[];
}

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

/**
 * Ingest new messages for a single knowledge channel.
 */
export async function ingestChannel(channelDbId: string, logger: Logger): Promise<IngestResult> {
  const [channel] = await db
    .select()
    .from(knowledgeChannels)
    .where(eq(knowledgeChannels.id, channelDbId))
    .limit(1);

  if (!channel) throw new Error(`Channel ${channelDbId} not found`);

  // Clear user cache between runs to avoid stale data
  clearUserCache();

  let [syncState] = await db
    .select()
    .from(knowledgeSyncState)
    .where(eq(knowledgeSyncState.channelId, channelDbId))
    .limit(1);

  if (!syncState) {
    const [created] = await db
      .insert(knowledgeSyncState)
      .values({ channelId: channelDbId })
      .returning();
    syncState = created;
  }

  const result: IngestResult = {
    channelName: channel.slackChannelName,
    newMessages: 0,
    newThreadReplies: 0,
    skipped: 0,
    errors: [],
  };

  const visibility: Visibility =
    channel.channelType === "internal" || channel.channelCategory === "client_internal"
      ? "internal"
      : "shared";
  const oldest = syncState.lastMessageTs ?? undefined;
  logger.info(`Fetching #${channel.slackChannelName} since ${oldest ?? "beginning"}`);

  const messages = await fetchChannelHistory(channel.slackChannelId, { oldest });
  logger.info(`Got ${messages.length} messages`);

  let latestTs = syncState.lastMessageTs;

  for (const msg of messages) {
    try {
      const processed = await processMessage(msg, channel, visibility, logger);
      if (processed === "skipped") {
        result.skipped++;
        continue;
      }
      result.newMessages++;
      // Only advance cursor on top-level messages — thread replies have later
      // timestamps but don't appear in conversations.history, so using them
      // as the cursor would cause us to miss future top-level messages.
      if (!latestTs || msg.ts > latestTs) latestTs = msg.ts;

      // Fetch thread replies
      if (msg.reply_count && msg.reply_count > 0) {
        const replies = await fetchThreadReplies(channel.slackChannelId, msg.ts);
        for (const reply of replies) {
          try {
            const rp = await processMessage(reply, channel, visibility, logger, msg.ts);
            if (rp !== "skipped") {
              result.newThreadReplies++;
              // Don't update latestTs here — see comment above
            }
          } catch (replyErr) {
            const replyErrMsg = replyErr instanceof Error ? replyErr.message : String(replyErr);
            result.errors.push(`reply ${reply.ts} (thread ${msg.ts}): ${replyErrMsg}`);
            logger.error(`Error processing thread reply ${reply.ts}: ${replyErrMsg}`);
            // Continue processing remaining replies
          }
        }
        await sleep(200);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`msg ${msg.ts}: ${errMsg}`);
      logger.error(`Error processing message ${msg.ts}: ${errMsg}`);
    }
  }

  // Update sync state
  await db
    .update(knowledgeSyncState)
    .set({
      lastMessageTs: latestTs,
      lastSyncedAt: new Date(),
      lastSyncError: result.errors.length > 0 ? result.errors.join("; ") : null,
      messagesIngested: sql`${knowledgeSyncState.messagesIngested} + ${result.newMessages + result.newThreadReplies}`,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSyncState.id, syncState.id));

  return result;
}

/**
 * Ingest all active knowledge channels.
 */
export async function ingestAllChannels(logger: Logger): Promise<IngestResult[]> {
  const channels = await db
    .select()
    .from(knowledgeChannels)
    .where(eq(knowledgeChannels.active, true));

  logger.info(`Found ${channels.length} active knowledge channels`);

  const results: IngestResult[] = [];
  for (const ch of channels) {
    try {
      results.push(await ingestChannel(ch.id, logger));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to ingest #${ch.slackChannelName}: ${errMsg}`);
      results.push({
        channelName: ch.slackChannelName,
        newMessages: 0,
        newThreadReplies: 0,
        skipped: 0,
        errors: [errMsg],
      });
    }
  }
  return results;
}

// --- Internal ---

type ChannelRow = typeof knowledgeChannels.$inferSelect;

async function processMessage(
  msg: SlackMessage,
  channel: ChannelRow,
  visibility: Visibility,
  _logger: Logger,
  parentTs?: string,
): Promise<"skipped" | "inserted"> {
  if (msg.subtype && SKIP_SUBTYPES.has(msg.subtype)) return "skipped";

  const text = msg.text?.trim() ?? "";
  if (!text && !msg.files?.length && !msg.attachments?.length) return "skipped";

  let authorName = "Unknown";
  let authorSide: string | null = null;
  if (msg.user) {
    try {
      const user = await resolveUser(msg.user);
      authorName = user.realName;
      authorSide = classifyUserSide(user);
    } catch {
      authorName = msg.user;
    }
  }

  const { allLinks, driveLinks } = extractLinks(text, msg.attachments);
  const mediaUrl = msg.files?.[0]?.url_private_download ?? msg.files?.[0]?.url_private ?? null;

  await db
    .insert(knowledgeEvents)
    .values({
      accountId: channel.accountId ?? null,
      channelId: channel.id,
      source: "slack",
      sourceRef: msg.ts,
      threadRef: parentTs ?? (msg.thread_ts !== msg.ts ? msg.thread_ts : null),
      authorSlackId: msg.user ?? msg.bot_id,
      authorName,
      authorSide,
      visibility,
      contentType: detectContentType(msg),
      rawContent: text,
      mediaUrl,
      links: allLinks,
      driveLinks,
      metadata: buildMetadata(msg),
      messageAt: new Date(parseFloat(msg.ts) * 1000),
    })
    .onConflictDoUpdate({
      target: [knowledgeEvents.channelId, knowledgeEvents.sourceRef],
      set: {
        rawContent: text,
        links: allLinks,
        driveLinks,
        metadata: buildMetadata(msg),
      },
    });

  return "inserted";
}
