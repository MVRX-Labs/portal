// ---------------------------------------------------------------------------
// Apify scraping
// ---------------------------------------------------------------------------

import { runApifyActor } from "@/lib/apify";

const APIFY_ACTOR_ID = "supreme_coder/linkedin-post";

export async function scrapeProfilePosts(
  linkedinUrl: string,
  maxPosts = 10
): Promise<{ runId: string; rawPosts: Record<string, unknown>[] }> {
  const items = (await runApifyActor(
    APIFY_ACTOR_ID,
    { urls: [linkedinUrl], limitPerSource: maxPosts },
    { label: `Engagement Bot: ${linkedinUrl}` }
  )) as Record<string, unknown>[];
  return { runId: "", rawPosts: items };
}

function parseDateTime(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(value > 1e12 ? value : value * 1000);
  }
  if (typeof value === "string") {
    const d = new Date(value.replace("Z", "+00:00"));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export interface NormalizedPost {
  apifyPostId: string;
  content: string;
  postUrl: string;
  likesCount: number;
  commentsCount: number;
  postedAt: Date | null;
}

export function normalizePost(raw: Record<string, unknown>): NormalizedPost {
  return {
    apifyPostId: (raw.id as string) || (raw.postId as string) || (raw.urn as string) || (raw.shareUrn as string) || "",
    content: (raw.text as string) || (raw.commentary as string) || "",
    postUrl: (raw.postUrl as string) || (raw.url as string) || "",
    likesCount: (raw.numLikes as number) || (raw.likeCount as number) || 0,
    commentsCount: (raw.numComments as number) || (raw.commentCount as number) || 0,
    postedAt: parseDateTime(raw.postedAt ?? raw.postedAtTimestamp ?? raw.postedAtISO ?? raw.publishedAt),
  };
}

export function extractAuthorName(raw: Record<string, unknown>): string {
  const author = raw.author;
  const authorDict = typeof author === "object" && author !== null ? (author as Record<string, unknown>) : {};

  const name = (raw.authorName as string) || (raw.authorFullName as string) || (authorDict.name as string) || "";
  if (name) return name.trim();

  const first = (raw.authorFirstName as string) || (authorDict.firstName as string) || "";
  const last = (raw.authorLastName as string) || (authorDict.lastName as string) || "";
  if (first || last) return `${first} ${last}`.trim();

  return "";
}

// ---------------------------------------------------------------------------
// Slack cards
// ---------------------------------------------------------------------------

interface PostForCard {
  id: string;
  content: string;
  postUrl: string;
  likesCount: number;
  commentsCount: number;
  engagementStatus: string;
  agentComment: string | null;
}

interface ProfileForCard {
  displayName: string;
}

function buildButton(label: string, action: string, postId: string, style?: string) {
  const btn: Record<string, unknown> = {
    type: "button",
    text: { type: "plain_text", text: label },
    action_id: `engage_${action}:${postId}`,
    value: postId,
  };
  if (style) btn.style = style;
  return btn;
}

export function buildPostCard(
  post: PostForCard,
  profile: ProfileForCard,
  decision?: string
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const name = profile.displayName || "LinkedIn Post";

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*New post from <${post.postUrl}|${name}>*` },
  });

  const content = post.content.length > 500 ? post.content.slice(0, 500) + "..." : post.content;
  if (content) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: content } });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `:thumbsup: ${post.likesCount}  :speech_balloon: ${post.commentsCount}` }],
  });

  if (decision) {
    let decisionText: string;
    if (decision === "failed") {
      decisionText = ":x: Failed to generate comment. Please try again.";
    } else if (post.engagementStatus === "awaiting_action") {
      decisionText = `:hourglass_flowing_sand: Action selected: *${decision}*`;
    } else {
      decisionText = `:white_check_mark: Action taken: *${decision}*`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: decisionText } });

    if (post.agentComment) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `Generated comment:\n> ${post.agentComment}` },
      });
    }

    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: ":link: Go to Post" },
          url: post.postUrl,
          action_id: "open_post_url",
        },
      ],
    });
  } else {
    blocks.push({
      type: "actions",
      elements: [
        buildButton("Comment", "comment", post.id, "primary"),
        buildButton("Like", "like", post.id),
        buildButton("Repost", "repost", post.id),
        buildButton("Skip", "skip", post.id, "danger"),
        {
          type: "button",
          text: { type: "plain_text", text: ":link: Go to Post" },
          url: post.postUrl,
          action_id: "open_post_url",
        },
      ],
    });
  }

  return blocks;
}

async function slackApi(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = process.env.SLACKBOT_TOKEN;
  if (!token) throw new Error("SLACKBOT_TOKEN not set");

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

export async function sendPostToSlack(channelId: string, post: PostForCard, profile: ProfileForCard): Promise<string> {
  const blocks = buildPostCard(post, profile);
  const data = await slackApi("chat.postMessage", {
    channel: channelId,
    blocks,
    text: `New post from ${profile.displayName}`,
    unfurl_links: false,
    unfurl_media: false,
  });
  return data.ts as string;
}

export async function updateSlackCard(
  channelId: string,
  messageTs: string,
  post: PostForCard,
  profile: ProfileForCard,
  decision: string
): Promise<void> {
  const blocks = buildPostCard(post, profile, decision);
  await slackApi("chat.update", { channel: channelId, ts: messageTs, blocks });
}

// ---------------------------------------------------------------------------
// LLM comment generation
// ---------------------------------------------------------------------------

const COMMENT_SYSTEM_PROMPT = `You are a professional LinkedIn engagement assistant.
Generate a thoughtful, relevant comment for the given LinkedIn post.
Keep it concise (1-3 sentences), authentic, and value-adding.
Do not be generic or sycophantic. Reference specific points from the post.

HUMANISATION RULES:
- NEVER use em dashes (\u2014). Use commas, periods, colons, or parentheses instead.
- NEVER use these words: delve, tapestry, moreover, furthermore, comprehensive, robust, utilize, leverage, nuanced, crucial, significant, transformative, testament, authentic, enhance, ever-evolving, game-changer, landscape, navigate, realm, embark, foster, facilitate, streamline, underscore, pivotal, vital, compelling, profound, multifaceted, cutting-edge, revolutionary.
- USE contractions naturally (it's, don't, can't, I've, we're, you'll).
- Vary sentence length. Mix short punchy fragments with longer flowing ones.
- Sound like a real person typing on their phone, not a PR team.`;

export async function generateComment(postContent: string, persona?: string): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  let systemPrompt = COMMENT_SYSTEM_PROMPT;
  if (persona) {
    systemPrompt = `You are commenting as: ${persona}\n\n${COMMENT_SYSTEM_PROMPT}`;
  }

  const prompt = `${systemPrompt}\n\nPost content:\n${postContent}`;

  let output = "";
  for await (const message of query({
    prompt,
    options: {
      model: "claude-sonnet-4-20250514",
      maxTurns: 1,
      allowedTools: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          output += block.text;
        }
      }
    }
  }

  if (!output) throw new Error("No response from LLM");
  return output;
}
