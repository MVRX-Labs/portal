/**
 * AI-generated reply suggestions for unreplied LinkedIn post comments.
 *
 * Uses Opus to generate suggested replies following one of three formulas
 * (randomly assigned per comment): engage_extend, story_spark, quick_warm.
 */

import Anthropic from "@anthropic-ai/sdk";
import { BANNED_PHRASES } from "@/lib/outbound-sequence/constants";
import { AI_TELL_VOCABULARY, buildShortFormHumanisationBlock } from "@/lib/humanisation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommentForReply {
  id: string;
  postId: string;
  authorName: string;
  authorHeadline: string | null;
  commentText: string;
}

export interface PostContext {
  id: string;
  content: string;
}

export type ReplyFormula = "engage_extend" | "story_spark" | "quick_warm";

export interface ReplySuggestion {
  commentId: string;
  formula: ReplyFormula;
  reply: string;
}

export interface GenerateReplySuggestionsInput {
  profileDisplayName: string;
  contentVoiceGuidance: string | null;
  comments: CommentForReply[];
  posts: Map<string, PostContext>;
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

// ---------------------------------------------------------------------------
// Formula assignment
// ---------------------------------------------------------------------------

const FORMULAS: ReplyFormula[] = ["engage_extend", "story_spark", "quick_warm"];

function assignFormula(): ReplyFormula {
  return FORMULAS[Math.floor(Math.random() * FORMULAS.length)];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(input: GenerateReplySuggestionsInput, assignments: Map<string, ReplyFormula>): string {
  const voiceSection = input.contentVoiceGuidance
    ? `\nVOICE & TONE GUIDANCE FOR ${input.profileDisplayName.toUpperCase()}:\n${input.contentVoiceGuidance}\n`
    : "";

  // Group comments by post
  const byPost = new Map<string, CommentForReply[]>();
  for (const c of input.comments) {
    const existing = byPost.get(c.postId) || [];
    existing.push(c);
    byPost.set(c.postId, existing);
  }

  let commentsSection = "";
  for (const [postId, comments] of byPost) {
    const post = input.posts.get(postId);
    const postContent = post?.content
      ? post.content.length > 500
        ? post.content.slice(0, 500) + "..."
        : post.content
      : "(post content unavailable)";

    commentsSection += `\n--- POST ---\nPost content: "${postContent}"\n\n`;

    for (const c of comments) {
      const formula = assignments.get(c.id);
      const headline = c.authorHeadline ? ` — ${c.authorHeadline}` : "";
      const commentText = c.commentText.length > 500 ? c.commentText.slice(0, 500) + "..." : c.commentText;
      commentsSection += `COMMENT [${c.id}] [FORMULA: ${formula}]\nAuthor: ${c.authorName}${headline}\nComment: "${commentText}"\n\n`;
    }
  }

  const bannedList = BANNED_PHRASES.map((p) => `- "${p}"`).join("\n");

  return `You are writing LinkedIn comment replies on behalf of ${input.profileDisplayName}.
${voiceSection}
═══════════════════════════════════════════
REPLY FORMULAS
═══════════════════════════════════════════

Each comment below has a formula assigned in brackets. Follow the assigned formula exactly.

1. ENGAGE & EXTEND (engage_extend)
   Acknowledge their specific point → Add a new insight or perspective → End with an open question.
   TONE: Thoughtful peer. Show you actually read what they wrote. Build on their idea.

2. STORY SPARK (story_spark)
   Brief acknowledgment → Short anecdote or experience that connects → Takeaway or reflection. No question at the end.
   TONE: Genuine, conversational. The anecdote should feel natural, not shoehorned.

3. QUICK & WARM (quick_warm)
   Specific acknowledgment of what they said → One brief thought. That's it. Under 200 characters.
   TONE: Warm but efficient. Don't overthink it.

═══════════════════════════════════════════
QUALITY RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════

- Maximum 4 sentences. Target 2-3 sentences for most replies.
- Under 500 characters total. Under 200 for quick_warm.
- Use contractions (I'm, you're, that's, we've).
- Never start more than one sentence with "I".
- No exclamation marks (zero is fine, one max).
- Reference something SPECIFIC from their comment — prove you read it.
- Sound like a real person typing on their phone, not a PR team.
- No hashtags in replies.
- No emojis unless the commenter used them first.
- Never use the commenter's name — LinkedIn already shows who you're replying to.

BANNED PHRASES (if any appear, the reply is rejected):
${bannedList}

═══════════════════════════════════════════
HUMANISATION RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════

${buildShortFormHumanisationBlock()}

═══════════════════════════════════════════
COMMENTS TO REPLY TO
═══════════════════════════════════════════
${commentsSection}
═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Output a JSON array. Each element:
{
  "commentId": "<the comment ID from above>",
  "formula": "<the assigned formula>",
  "reply": "<the suggested reply text>"
}

Output ONLY the JSON array in a code fence. No other text.`;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const anthropic = new Anthropic();

export async function generateReplySuggestions(
  input: GenerateReplySuggestionsInput,
  logger: Logger
): Promise<Map<string, ReplySuggestion>> {
  if (input.comments.length === 0) return new Map();

  // Assign formulas randomly in code
  const assignments = new Map<string, ReplyFormula>();
  for (const c of input.comments) {
    assignments.set(c.id, assignFormula());
  }

  const prompt = buildPrompt(input, assignments);

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  logger.info(`Reply suggestions LLM: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);

  // Extract JSON array — extractJSON only handles objects, so we handle arrays here
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = fenced ? fenced[1] : text;
  const parsed: { commentId: string; formula: ReplyFormula; reply: string }[] = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error("LLM output is not a JSON array");
  }

  // Filter out replies containing banned phrases or AI-tell vocabulary
  const bannedLower = [...BANNED_PHRASES, ...AI_TELL_VOCABULARY].map((p) => p.toLowerCase());
  const result = new Map<string, ReplySuggestion>();
  for (const item of parsed) {
    const replyLower = item.reply.toLowerCase();
    const hasBanned = bannedLower.some((bp) => replyLower.includes(bp));
    if (hasBanned) {
      logger.warn(`Dropped reply for ${item.commentId}: contained banned phrase or AI-tell word`);
      continue;
    }
    result.set(item.commentId, {
      commentId: item.commentId,
      formula: item.formula,
      reply: item.reply,
    });
  }

  return result;
}
