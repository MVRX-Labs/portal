/**
 * Knowledge Hub types — shared across ingestion, normalisation, and synthesis.
 */

export type ChannelType = "shared" | "internal";

export type ChannelCategory = "client_shared" | "client_internal" | "general" | "product" | "ops";

export type EventSource = "slack" | "granola" | "drive" | "crm";

export type MediaType = "text" | "voice_note" | "image" | "video" | "pdf" | "gdoc" | "gsheet" | "gpres";

export type KnowledgeUnitType =
  | "action_item"
  | "decision"
  | "context_update"
  | "content_draft"
  | "request"
  | "feedback"
  | "deliverable"
  | "blocker"
  | "product_bug"
  | "product_feature";

export type KnowledgeUnitStatus = "open" | "done";

export type StateDocType = "brief" | "open_items" | "activity_log";

export type Visibility = "shared" | "internal";

/** Raw Slack message shape (subset we care about) */
export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  bot_id?: string;
  reply_count?: number;
  thread_ts?: string;
  files?: SlackFile[];
  attachments?: SlackAttachment[];
  reactions?: Array<{ name: string; count: number; users: string[] }>;
}

export interface SlackFile {
  id: string;
  name: string;
  filetype: string;
  size: number;
  url_private?: string;
  url_private_download?: string;
  mimetype?: string;
}

export interface SlackAttachment {
  title?: string;
  title_link?: string;
  text?: string;
  fallback?: string;
}

/** Resolved Slack user info */
export interface SlackUser {
  id: string;
  realName: string;
  displayName: string;
  email?: string;
  teamId: string;
  isBot: boolean;
}

/** Extracted knowledge unit from normalisation */
export interface ExtractedUnit {
  type: KnowledgeUnitType;
  content: string;
  accountSlug?: string; // For cross-account channels — LLM identifies the account
  author?: string;
  assignee?: string;
  requestedBy?: string;
  dueDate?: string;
  status?: KnowledgeUnitStatus;
  confidence: number;
  sourceMessageTimestamps: string[]; // Slack ts values to trace back to events
}
