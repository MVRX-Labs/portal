/**
 * Twitter/X scraping and Slack engagement bot helpers.
 *
 * Parallel to linkedin-engagement-bot.ts — provides scraping, normalisation,
 * Slack card building, and reply generation for Twitter profiles.
 *
 * Uses `scrape.badger/twitter-tweets-scraper` for all scraping via its
 * mode-based API: "Advanced Search", "Get Replies", "Get Retweeters".
 *
 * NOTE: Tweet likes (favoriters) are NOT scrapable — Twitter made likes
 * private in 2024. We track likes only via aggregate favorite_count on tweets.
 */

import Anthropic from "@anthropic-ai/sdk";
import { runApifyActor, runApifyActorPaginated } from "@/lib/apify";
import { AI_TELL_VOCABULARY } from "@/lib/humanisation";

// ---------------------------------------------------------------------------
// Apify actor — single actor, multiple modes
// ---------------------------------------------------------------------------

const TWITTER_ACTOR_ID = "scrape.badger/twitter-tweets-scraper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedTweet {
  externalTweetId: string;
  content: string;
  tweetUrl: string;
  tweetType: "tweet" | "retweet" | "quote_tweet" | "reply";
  likesCount: number;
  retweetsCount: number;
  quotesCount: number;
  repliesCount: number;
  bookmarksCount: number;
  viewsCount: number;
  postedAt: Date | null;
}

export interface ScrapedReply {
  tweetId: string;
  authorName: string;
  authorHandle: string | null;
  authorBio: string | null;
  authorTwitterUrl: string | null;
  replyText: string;
  replyUrl: string | null;
  repliedAt: Date | null;
  isReply: boolean;
  parentReplyId: string | null;
}

export interface EngagedPerson {
  authorName: string;
  authorHandle: string | null;
  authorTwitterUrl: string | null;
  authorBio: string | null;
  authorCompany: string | null;
  authorProfileImage: string | null;
  engagementType: "retweet";
  engagedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Scraping functions
// ---------------------------------------------------------------------------

/**
 * Scrape recent tweets from a Twitter profile via Apify.
 * Uses "Advanced Search" mode with `from:handle` query.
 */
export async function scrapeProfileTweets(
  twitterUrl: string,
  maxTweets = 10,
  signal?: AbortSignal,
  log?: (message: string, extra?: Record<string, unknown>) => void
): Promise<{ runId: string; rawTweets: any[] }> {
  const handle = extractHandle(twitterUrl);
  const result = await runApifyActor(
    TWITTER_ACTOR_ID,
    {
      mode: "Advanced Search",
      query: `from:${handle || twitterUrl}`,
      query_type: "Latest",
      max_results: maxTweets,
    },
    {
      label: `tweets:${handle}`,
      signal,
      log,
    }
  );

  const data = result as any;
  return {
    runId: data?.runId || "",
    rawTweets: Array.isArray(data) ? data : [],
  };
}

/**
 * Normalize a raw scrape.badger tweet into our standard format.
 *
 * Field mapping (scrape.badger flat format):
 *   id → externalTweetId
 *   full_text / text → content
 *   username → used to build tweetUrl
 *   user_name → authorName
 *   favorite_count → likesCount
 *   retweet_count → retweetsCount
 *   quote_count → quotesCount
 *   reply_count → repliesCount
 *   bookmark_count → bookmarksCount
 *   view_count (no 's') → viewsCount
 *   is_retweet, is_quote_status, in_reply_to_status_id → tweetType
 */
export function normalizeTweet(raw: any): NormalizedTweet | null {
  const tweetId = raw.id_str || raw.id || raw.tweetId || raw.tweet_id;
  if (!tweetId) return null;

  const content = raw.full_text || raw.text || raw.content || "";

  // scrape.badger uses flat `username`, not nested `user.screen_name`
  const screenName = raw.username || raw.user?.screen_name || raw.screen_name;
  const tweetUrl = raw.url || raw.tweetUrl || (screenName ? `https://x.com/${screenName}/status/${tweetId}` : "");

  let tweetType: NormalizedTweet["tweetType"] = "tweet";
  if (raw.is_retweet || raw.retweeted_status) tweetType = "retweet";
  else if (raw.is_quote_status || raw.quoted_status) tweetType = "quote_tweet";
  // scrape.badger uses in_reply_to_status_id (no _str suffix)
  else if (
    raw.in_reply_to_status_id_str ||
    raw.in_reply_to_status_id ||
    raw.in_reply_to_user_id_str ||
    raw.in_reply_to_user_id
  )
    tweetType = "reply";

  const postedAt = raw.created_at ? new Date(raw.created_at) : raw.postedAt ? new Date(raw.postedAt) : null;

  return {
    externalTweetId: String(tweetId),
    content,
    tweetUrl,
    tweetType,
    likesCount: raw.favorite_count ?? raw.likes ?? raw.likesCount ?? 0,
    retweetsCount: raw.retweet_count ?? raw.retweets ?? raw.retweetsCount ?? 0,
    quotesCount: raw.quote_count ?? raw.quotes ?? raw.quotesCount ?? 0,
    repliesCount: raw.reply_count ?? raw.replies ?? raw.repliesCount ?? 0,
    bookmarksCount: raw.bookmark_count ?? raw.bookmarks ?? raw.bookmarksCount ?? 0,
    // scrape.badger uses view_count (singular), not views_count
    viewsCount: raw.view_count ?? raw.views_count ?? raw.views ?? raw.viewsCount ?? 0,
    postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt : null,
  };
}

/**
 * Extract Twitter handle from URL or @handle.
 */
export function extractHandle(input: string): string | null {
  if (input.startsWith("@")) return input.slice(1).toLowerCase();
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    const match = input.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/?$/i);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

/**
 * Extract display name from raw scrape.badger tweet data.
 * scrape.badger uses flat `user_name` field, not nested `user.name`.
 */
export function extractAuthorName(raw: any): string | null {
  return raw.user_name || raw.user?.name || raw.author?.name || raw.authorName || raw.name || null;
}

/**
 * Extract a tweet ID from a tweet URL.
 */
function extractTweetId(tweetUrl: string): string | null {
  const match = tweetUrl.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Scrape replies to a tweet via Apify.
 * Uses "Get Replies" mode with tweet ID.
 *
 * scrape.badger reply fields are flat:
 *   user_name (not user.name), username (not user.screen_name),
 *   user_description (not user.description), in_reply_to_status_id (no _str)
 */
export async function scrapeTweetReplies(
  tweetUrl: string,
  signal?: AbortSignal,
  log?: (message: string, extra?: Record<string, unknown>) => void
): Promise<ScrapedReply[]> {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) return [];

  const results = await runApifyActorPaginated(
    TWITTER_ACTOR_ID,
    {
      mode: "Get Replies",
      id: tweetId,
      max_results: 50,
    },
    { maxPages: 3, signal, log }
  );

  return results
    .filter((r: any) => r.in_reply_to_status_id || r.in_reply_to_status_id_str || r.isReply)
    .map((r: any): ScrapedReply => {
      const handle = r.username || r.user?.screen_name || r.authorHandle;
      const id = String(r.id_str || r.id || r.tweetId || "");
      return {
        tweetId: id,
        // scrape.badger flat fields
        authorName: r.user_name || r.user?.name || r.authorName || "",
        authorHandle: handle || null,
        authorBio: r.user_description || r.user?.description || r.authorBio || null,
        authorTwitterUrl: handle ? `https://x.com/${handle}` : r.authorTwitterUrl || null,
        replyText: r.full_text || r.text || r.content || "",
        // Construct URL from handle + id since scrape.badger doesn't provide one
        replyUrl: r.url || r.tweetUrl || (handle && id ? `https://x.com/${handle}/status/${id}` : null),
        repliedAt: r.created_at ? new Date(r.created_at) : null,
        isReply: true,
        parentReplyId: r.in_reply_to_status_id?.toString() || r.in_reply_to_status_id_str || null,
      };
    });
}

/**
 * Scrape retweeters of a tweet via Apify.
 * Uses "Get Retweeters" mode with tweet ID.
 *
 * Returns user profiles (flat format): name, username, description, profile_image_url
 *
 * NOTE: Likes (favoriters) are NOT available — Twitter made them private in 2024.
 */
export async function scrapeTweetRetweeters(
  tweetUrl: string,
  signal?: AbortSignal,
  log?: (message: string, extra?: Record<string, unknown>) => void,
  engagedAt?: Date
): Promise<EngagedPerson[]> {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) return [];

  const results = await runApifyActorPaginated(
    TWITTER_ACTOR_ID,
    {
      mode: "Get Retweeters",
      id: tweetId,
      max_results: 50,
    },
    { maxPages: 3, signal, log }
  );

  return results.map(
    (r: any): EngagedPerson => ({
      authorName: r.name || r.user_name || r.user?.name || r.fullName || "",
      // scrape.badger retweeters use `username` (no `screen_name`)
      authorHandle: r.username || r.screen_name || r.user?.screen_name || null,
      authorTwitterUrl:
        r.username || r.screen_name ? `https://x.com/${r.username || r.screen_name}` : r.profileUrl || null,
      authorBio: r.description || r.bio || r.user_description || r.user?.description || null,
      authorCompany: null,
      authorProfileImage: r.profile_image_url || r.profileImageUrl || null,
      engagementType: "retweet",
      engagedAt: engagedAt || null,
    })
  );
}

// ---------------------------------------------------------------------------
// Slack helpers
// ---------------------------------------------------------------------------

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

/**
 * Send a tweet to Slack as an engagement card with action buttons.
 */
export async function sendTweetToSlack(
  channelId: string,
  post: {
    id: string;
    content: string;
    tweetUrl: string;
    likesCount: number;
    retweetsCount: number;
    repliesCount: number;
  },
  profile: { displayName: string }
): Promise<string> {
  const snippet = post.content.length > 300 ? post.content.slice(0, 297) + "..." : post.content;

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${profile.displayName}* tweeted:\n\n${snippet}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Likes: ${post.likesCount} | Retweets: ${post.retweetsCount} | Replies: ${post.repliesCount}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Reply" },
          action_id: `tw_engage_reply:${post.id}`,
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Like" },
          action_id: `tw_engage_like:${post.id}`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Retweet" },
          action_id: `tw_engage_retweet:${post.id}`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Skip" },
          action_id: `tw_engage_skip:${post.id}`,
          style: "danger",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "View Tweet" },
          url: post.tweetUrl,
        },
      ],
    },
  ];

  const data = await slackApi("chat.postMessage", {
    channel: channelId,
    blocks,
    text: `New tweet from ${profile.displayName}`,
    unfurl_links: false,
    unfurl_media: false,
  });
  return data.ts as string;
}

/**
 * Update an existing Slack engagement card to reflect the action taken.
 */
export async function updateTwitterSlackCard(
  channelId: string,
  messageTs: string,
  post: {
    id: string;
    content: string;
    tweetUrl: string;
    likesCount: number;
    retweetsCount: number;
    repliesCount: number;
    agentComment: string | null;
  },
  profile: { displayName: string },
  decision: string
): Promise<void> {
  const snippet = post.content.length > 300 ? post.content.slice(0, 297) + "..." : post.content;

  const statusEmoji =
    decision === "reply"
      ? "💬"
      : decision === "like"
        ? "❤️"
        : decision === "retweet"
          ? "🔁"
          : decision === "skip"
            ? "⏭️"
            : decision === "failed"
              ? "❌"
              : "⏳";
  const statusLabel =
    decision === "failed" ? "Generation failed" : decision.charAt(0).toUpperCase() + decision.slice(1);

  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${profile.displayName}* tweeted:\n\n${snippet}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Likes: ${post.likesCount} | Retweets: ${post.retweetsCount} | Replies: ${post.repliesCount}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusEmoji} *${statusLabel}*${post.agentComment ? `\n\n_Suggested reply:_ "${post.agentComment}"` : ""}`,
      },
    },
  ];

  if (post.tweetUrl) {
    blocks.push({
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: "View Tweet" }, url: post.tweetUrl }],
    });
  }

  await slackApi("chat.update", {
    channel: channelId,
    ts: messageTs,
    blocks,
    text: `${statusLabel}: tweet from ${profile.displayName}`,
  });
}

// ---------------------------------------------------------------------------
// AI reply generation
// ---------------------------------------------------------------------------

const anthropic = new Anthropic();
const AI_TELL_LIST = AI_TELL_VOCABULARY.join(", ");

/**
 * Generate a reply to a tweet using Claude.
 */
export async function generateReply(tweetContent: string, persona?: string): Promise<string> {
  const personaBlock = persona
    ? `\nYou are replying as this persona: ${persona}\nMatch this persona's tone and perspective.`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Write a Twitter reply to this tweet. The reply should be professional, genuine, and add value to the conversation.${personaBlock}

Rules:
- Max 280 characters
- Use contractions naturally
- Sound like a real person, not a bot
- Add a genuine insight, question, or perspective
- No em dashes
- No hashtags or emojis unless the tweet used them
- Never use these words: ${AI_TELL_LIST}
- 1-2 sentences max

Tweet: "${tweetContent}"

Reply:`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  // Strip quotes if the model wrapped the reply
  return text.replace(/^["']|["']$/g, "");
}
