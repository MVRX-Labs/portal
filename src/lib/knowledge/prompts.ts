/**
 * Knowledge Hub — Prompt builders for normalisation stages.
 *
 * Stage 1: Classification (group messages by account + category)
 * Stage 2: Extraction (extract knowledge units per account)
 */

export interface AccountContext {
  slug: string;
  name: string;
  contacts: Array<{ name: string; role?: string; side: "client" | "mvrx" }>;
}

export interface OpenItem {
  id: string;
  content: string;
  assignee: string | null;
  type: string;
}

/**
 * Stage 1: Classification prompt for general/cross-account channels.
 * Identifies which account(s) each message group relates to.
 */
export function buildClassificationPrompt(
  messages: string,
  accounts: AccountContext[],
): string {
  const accountList = accounts
    .map((a) => `- ${a.slug}: ${a.name} (contacts: ${a.contacts.map((c) => c.name).join(", ") || "none"})`)
    .join("\n");

  return `You are classifying Slack messages to determine which client account they relate to and whether they contain extractable knowledge.

Known accounts:
${accountList}

Messages to classify:
${messages}

For each logical group of messages (a thread, or related standalone messages), output:
- messageIndices: array of message indices (e.g. [1, 2, 3]) — reference the [msg:N] tags in the messages above
- accountSlug: which account this relates to (use exact slug from the list above), or null if internal/general
- category: one of "action_items", "decision", "update", "content_work", "discussion", "noise"
- worthExtracting: true if this contains actionable information (tasks, decisions, updates, deliverables). false for casual chat, reactions, "ok", "thanks", etc.
- reasoning: brief explanation of your classification

Output ONLY a JSON object matching this structure:
{
  "groups": [
    {
      "messageIndices": [1, 2],
      "accountSlug": "60x",
      "category": "action_items",
      "worthExtracting": true,
      "reasoning": "Tarun assigning weekly tasks for 60x"
    }
  ]
}`;
}

/** Already-extracted unit summary (for dedup context in prompts). */
export interface ExtractedSummary {
  type: string;
  content: string;
  assignee: string | null;
  status: string;
}

/**
 * Stage 2: Extraction prompt for a specific account's messages.
 */
export function buildExtractionPrompt(
  messages: string,
  account: AccountContext | null,
  openItems: OpenItem[],
  channelCategory: string,
  alreadyExtracted?: ExtractedSummary[],
): string {
  const accountSection = account
    ? `Account: ${account.name} (${account.slug})
Client contacts: ${account.contacts.filter((c) => c.side === "client").map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join(", ") || "none"}
MVRX team: ${account.contacts.filter((c) => c.side === "mvrx").map((c) => c.name).join(", ") || "none"}`
    : `Context: Internal ${channelCategory} channel (no specific client account)`;

  const openItemsSection = openItems.length > 0
    ? `\nCurrently open items (check if any are now completed):\n${openItems.map((i) => `- [${i.type}] ${i.content}${i.assignee ? ` (assigned: ${i.assignee})` : ""}`).join("\n")}`
    : "\nNo currently open items.";

  const alreadyExtractedSection = alreadyExtracted && alreadyExtracted.length > 0
    ? `\nALREADY EXTRACTED (DO NOT re-extract these — they exist in the database):\n${alreadyExtracted.map((u) => `- [${u.type}] ${u.content.slice(0, 120)}${u.assignee ? ` (${u.assignee})` : ""} [${u.status}]`).join("\n")}`
    : "";

  return `You are extracting structured knowledge from Slack messages.

${accountSection}
${openItemsSection}
${alreadyExtractedSection}

Messages to process:
${messages}

Extract knowledge units from these messages. For each unit provide:
- type: action_item | decision | context_update | content_draft | request | feedback | deliverable | blocker | product_bug | product_feature
- content: clear, specific description (not vague — include what, who, when)
- assignee: full name of the person who needs to act (null if unclear or general)
- requestedBy: full name of the person who asked for it (null if self-assigned or unclear)
- dueDate: ISO date string if mentioned or clearly implied (null otherwise)
- status: "open" or "done"
- confidence: 0-100 how confident you are this extraction is accurate
- sourceMessages: array of message indices (e.g. [1, 3, 5]) — reference the [msg:N] tags in the messages above
- reasoning: brief explanation of why you extracted this and how you determined the assignee/type

Status rules:
- action_item: "open" if still pending, "done" if completed in these messages
- decision: ALWAYS "done" — a decision is a fact that was made
- context_update: ALWAYS "done" — context is information, not a task
- deliverable: "done" if delivered, "open" if promised but not yet shared
- content_draft: "open" if draft needs review, "done" if approved/published
- blocker/product_bug: "open" unless resolved in these messages
- request/feedback: "open" if needs response, "done" if acknowledged/addressed

Extraction rules:
- ONE unit per distinct action/decision/update. Split compound tasks into separate units.
- DO NOT re-extract anything from the "ALREADY EXTRACTED" list above. Only extract NEW information.
- If a message updates an already-extracted item, include it in completedItems instead.
- Voice note transcriptions appear in [TRANSCRIPTION] blocks — treat them as first-class content.
- Drive document content appears in [DOCUMENT] blocks.
- For action_items: assignee is who DOES the work, requestedBy is who ASKED for it.
- Confidence below 60 means you're guessing — be honest. Vary confidence per unit.
- Skip "ok", "thanks", "👍", emoji-only messages entirely.

Also identify any currently open items that appear completed based on these messages.

Output ONLY a JSON object:
{
  "units": [
    {
      "type": "action_item",
      "content": "Review carousel designs for AI pricing post",
      "assignee": "Charlie Cheesman",
      "requestedBy": "Tarun Odedra",
      "dueDate": null,
      "status": "open",
      "confidence": 85,
      "sourceMessages": [1, 3],
      "reasoning": "Tarun explicitly assigned this to Charlie in the weekly action items"
    }
  ],
  "completedItems": [
    {
      "matchDescription": "Send lead list to 60x",
      "evidence": "Tarun shared the lead list spreadsheet in this batch",
      "sourceMessages": [2, 4]
    }
  ]
}`;
}

/** Result of formatting: the prompt text + index→eventId mapping. */
export interface FormattedMessages {
  text: string;
  indexToEventId: Map<number, string>;
}

/**
 * Format events into readable message text for the LLM prompt.
 * Returns both the formatted text and a mapping from msg indices to event IDs,
 * so we don't rely on the LLM to copy timestamps correctly.
 */
export function formatMessagesForPrompt(
  events: Array<{
    id: string;
    sourceRef: string;
    authorName: string | null;
    authorSide: string | null;
    rawContent: string | null;
    resolvedContent: string | null;
    contentType: string;
    threadRef: string | null;
    messageAt: Date;
  }>,
): FormattedMessages {
  const indexToEventId = new Map<number, string>();
  let msgIndex = 1;

  // Group by thread
  const threads = new Map<string, typeof events>();
  const standalone: typeof events = [];

  for (const evt of events) {
    if (evt.threadRef) {
      const key = evt.threadRef;
      if (!threads.has(key)) threads.set(key, []);
      threads.get(key)!.push(evt);
    } else {
      standalone.push(evt);
    }
  }

  const parts: string[] = [];

  for (const evt of standalone) {
    indexToEventId.set(msgIndex, evt.id);
    parts.push(formatSingleMessage(evt, msgIndex++));

    const replies = threads.get(evt.sourceRef);
    if (replies) {
      for (const reply of replies) {
        indexToEventId.set(msgIndex, reply.id);
        parts.push(`  ↳ ${formatSingleMessage(reply, msgIndex++)}`);
      }
      threads.delete(evt.sourceRef);
    }
  }

  for (const [, replies] of threads) {
    parts.push(`[Thread — parent message not in this batch]`);
    for (const reply of replies) {
      indexToEventId.set(msgIndex, reply.id);
      parts.push(`  ${formatSingleMessage(reply, msgIndex++)}`);
    }
  }

  return { text: parts.join("\n"), indexToEventId };
}

/**
 * State synthesis prompt — generates/updates per-account state documents.
 */
export function buildStateSynthesisPrompt(
  accountName: string,
  contacts: AccountContext["contacts"],
  openUnits: Array<{ type: string; content: string; assignee: string | null; createdAt: Date }>,
  recentDoneUnits: Array<{ type: string; content: string; assignee: string | null; completedAt?: string }>,
  currentBrief: string | null,
  currentActivityLog: string | null,
): string {
  const contactList = contacts.length > 0
    ? contacts.map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""} [${c.side}]`).join("\n")
    : "No contacts registered";

  const openSection = openUnits.length > 0
    ? openUnits.map((u) => `- [${u.type}] ${u.content}${u.assignee ? ` (assigned: ${u.assignee})` : ""} — created ${u.createdAt.toISOString().slice(0, 10)}`).join("\n")
    : "No open items";

  const doneSection = recentDoneUnits.length > 0
    ? recentDoneUnits.map((u) => `- [${u.type}] ${u.content}${u.assignee ? ` (${u.assignee})` : ""}${u.completedAt ? ` — completed ${u.completedAt}` : ""}`).join("\n")
    : "No recently completed items";

  const briefSection = currentBrief ? `\nCurrent brief (update, don't rewrite from scratch unless outdated):\n${currentBrief}` : "\nNo existing brief — create one from scratch.";
  const activitySection = currentActivityLog ? `\nCurrent activity log (append new activity, trim entries older than 14 days):\n${currentActivityLog}` : "\nNo existing activity log — create one from scratch.";

  return `You are synthesising state documents for a client account. These docs are used by the MVRX team to quickly understand the account status.

Account: ${accountName}
Contacts:
${contactList}

Open knowledge units:
${openSection}

Recently completed items (last 14 days):
${doneSection}
${briefSection}
${activitySection}

Generate three state documents:

1. **brief**: Executive summary (~500 words). Cover: current status, active workstreams, key people, recent decisions, open blockers. Write in present tense, be specific.

2. **openItems**: Structured markdown list of ALL open items, grouped by type. Format:
   ## Action Items
   - [ ] Item description (assigned: Name)
   ## Blockers
   - [ ] Blocker description
   (etc for each type that has open items)

3. **activityLog**: Rolling 2-week activity summary. Format as a reverse-chronological list:
   - **YYYY-MM-DD**: What happened, by whom
   Only include the last 14 days. Trim older entries.

Output ONLY a JSON object:
{
  "brief": "Executive summary text...",
  "openItems": "Structured markdown list...",
  "activityLog": "Rolling 2-week log..."
}`;
}

function formatSingleMessage(
  evt: {
    sourceRef: string;
    authorName: string | null;
    authorSide: string | null;
    rawContent: string | null;
    resolvedContent: string | null;
    contentType: string;
    messageAt: Date;
  },
  index: number,
): string {
  const ts = evt.messageAt.toISOString().slice(0, 16);
  const author = evt.authorName ?? "Unknown";
  const side = evt.authorSide ? ` (${evt.authorSide})` : "";
  let content = evt.rawContent ?? "";

  if (evt.resolvedContent) {
    if (evt.contentType === "voice_note") {
      content += `\n[TRANSCRIPTION] ${evt.resolvedContent}`;
    } else {
      content += `\n[DOCUMENT] ${evt.resolvedContent.slice(0, 2000)}`;
    }
  }

  return `[msg:${index}] [${ts}] ${author}${side}: ${content}`;
}
