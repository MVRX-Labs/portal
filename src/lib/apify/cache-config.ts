/**
 * Apify cache TTL configuration.
 *
 * All cache lifetimes in one place. Edit this map to change how long
 * responses are cached for any actor. Actors not listed here use the
 * DEFAULT_CACHE_TTL_SECS (30 days).
 *
 * Values are in seconds.
 */

export const APIFY_CACHE_TTLS: Record<string, number> = {
  // --- Engagement data (changes rapidly) — 5 minutes ---
  Wpp1BZ6yGWjySadk3: 5 * 60, // LinkedIn Posts Scraper
  "supreme_coder/linkedin-post": 5 * 60, // LinkedIn Post (engagement-bot)
  "apimaestro~linkedin-post-reactions": 5 * 60, // Post Reactions
  "apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies": 5 * 60, // Comments & Replies
  "apimaestro~linkedin-post-reshares": 5 * 60, // Reshares/Reposts

  // --- Twitter engagement data (changes rapidly) — 5 minutes ---
  "scrape.badger/twitter-tweets-scraper": 5 * 60, // Twitter Tweets (all modes: search, replies, retweeters)

  // --- Alpha feed keyword searches — 1 hour ---
  "apimaestro~linkedin-posts-search-scraper-no-cookies": 60 * 60, // Post Search (alpha feed)

  // --- Everything else — 30 days (default) ---
  // Actors below are listed for documentation; they all use the default.
  // Uncomment and set a custom value to override.
  //
  // "VhxlqQXRwhW8H5hNV":               30 days,  // LinkedIn Profile Scraper
  // "ecomdate/similarweb-scraper":       30 days,  // SimilarWeb
  // "radeance/ahrefs-scraper":           30 days,  // Ahrefs
  // "UFSUQD7pWNwN3jExC":               30 days,  // SEO Audit
  // "nFJndFXA5zjCTuudP":               30 days,  // Google SERP
  // "trudax/reddit-scraper-lite":        30 days,  // Reddit
  // "apify/instagram-profile-scraper":   30 days,  // Instagram
  // "clockworks/tiktok-profile-scraper": 30 days,  // TikTok
  // "oKbfaRlpOJ4bubyBN":               30 days,  // Reddit (sentiment)
  // "compass/Google-Maps-Reviews-Scraper": 30 days, // Google Maps Reviews
  // "aYG0l9s7dbB7j3gbS":               30 days,  // Cheerio Scraper
};

/** Default TTL for actors not explicitly listed above: 30 days */
export const DEFAULT_CACHE_TTL_SECS = 30 * 24 * 60 * 60;

/** Look up the cache TTL for a given actor ID. Handles slash/tilde variants. */
export function getCacheTtl(actorId: string): number {
  const normalised = actorId.replace("/", "~");
  const original = actorId.replace("~", "/");
  return (
    APIFY_CACHE_TTLS[actorId] ?? APIFY_CACHE_TTLS[normalised] ?? APIFY_CACHE_TTLS[original] ?? DEFAULT_CACHE_TTL_SECS
  );
}
