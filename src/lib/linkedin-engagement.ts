import { sendSlackNotification } from "@/lib/slack";

const APIFY_BASE = "https://api.apify.com/v2";
const POSTS_ACTOR_ID = "Wpp1BZ6yGWjySadk3";
const REACTIONS_ACTOR_ID = "apimaestro~linkedin-post-reactions";
const COMMENTS_ACTOR_ID = "apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies";
const RESHARES_ACTOR_ID = "apimaestro~linkedin-post-reshares";

function log(message: string) {
  console.log(`[linkedin-engagement] ${message}`);
}

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

async function runApifyActor(actorId: string, input: unknown, signal?: AbortSignal): Promise<unknown[]> {
  const token = requiredEnv("APIFY_API_TOKEN");
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

  log(`Starting Apify actor ${actorId}...`);
  const start = Date.now();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify actor ${actorId} failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Apify actor ${actorId} completed in ${elapsed}s`);

  return (await res.json()) as unknown[];
}

/**
 * Run a paginated Apify actor, fetching all pages.
 * Assumes 100 items per page and the input field `page_number`.
 */
async function runApifyActorPaginated(
  actorId: string,
  baseInput: Record<string, unknown>,
  signal?: AbortSignal,
  maxPages = 5, // Note this is a cost-safety feature. We don't want to run forever.
  runId?: string,
): Promise<unknown[]> {
  const allResults: unknown[] = [];
  let page = 1;

  while (page <= maxPages) {
    const results = await runApifyActor(actorId, { ...baseInput, page_number: page }, signal);

    log(`Page ${page}: ${results.length} results`);
    if (results.length === 0) break;

    allResults.push(...results);

    // If fewer than 100, we've reached the last page
    if (results.length < 100) break;
    page++;
  }

  log(`Total fetched: ${allResults.length} (${page} page(s))`);
  if (allResults.length === 500) {
    sendSlackNotification({
      tool: "linkedin-engagement",
      userName: "trigger-task",
      error: "Paginated actor returned 500 results. Nice post Tarun.",
      runId: runId ?? "unknown",
    });
  }
  return allResults;
}

export interface EngagedPerson {
  firstName: string;
  lastName: string | null;
  linkedinUrl: string;
  linkedinUrnUrl: string | null;
  linkedinSlug: string | null;
  headline: string | null;
  company: string | null;
  profileImageUrl: string | null;
  engagementType: "reaction" | "comment" | "repost";
  postUrl: string;
  /** The date of the post this person engaged with (not the scrape date). */
  engagedAt: Date;
}

function extractLinkedinSlug(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

/** Returns true if the URL is a URN-style LinkedIn URL (e.g. /in/ACoAAA...) */
function isUrnUrl(url: string): boolean {
  return /\/in\/ACo[A-Z]/i.test(url);
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "Unknown", lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Try to extract a usable Date from whatever the actor gives us. */
function parsePostDate(raw: unknown): Date | null {
  if (raw == null) return null;

  if (typeof raw === "number") {
    return new Date(raw < 1e12 ? raw * 1000 : raw);
  }

  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Relative strings like "3d", "2w", "5h", "1mo" (LinkedIn style)
  const relMatch = s.match(/^(\d+)\s*(s|m|h|d|w|mo|y)/i);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const now = new Date();
    const msPerUnit: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
      mo: 2_592_000_000,
      y: 31_536_000_000,
    };
    if (msPerUnit[unit]) {
      return new Date(now.getTime() - n * msPerUnit[unit]);
    }
  }

  return null;
}

function isRecentPost(parsedDate: Date | null, hoursAgo: number): boolean {
  if (!parsedDate) return false;
  const cutoff = new Date(Date.now() - hoursAgo * 3_600_000);
  return parsedDate >= cutoff;
}

function extractDateField(post: Record<string, unknown>): { key: string; raw: unknown } | null {
  const candidates = [
    "postedAtISO",
    "postedAtTimestamp",
    "postedDate",
    "postedAt",
    "publishedAt",
    "date",
    "time",
    "timestamp",
    "createdAt",
    "timeSincePosted",
  ];
  for (const key of candidates) {
    if (post[key] != null && post[key] !== "") {
      return { key, raw: post[key] };
    }
  }
  return null;
}

export interface ScrapedPost {
  postUrl: string;
  postedDate: string;
  numLikes: number;
  numComments: number;
  numShares: number;
}

/**
 * Discover recent posts for a LinkedIn profile/company page.
 * Returns post URLs and metadata only — reactions/comments/reshares are scraped separately.
 */
export async function scrapeRecentPosts(linkedinUrl: string, signal?: AbortSignal, hoursBack = 25): Promise<ScrapedPost[]> {
  const results = await runApifyActor(
    POSTS_ACTOR_ID,
    {
      urls: [linkedinUrl],
      limitPerSource: 20,
      deepScrape: true,
    },
    signal,
  );

  log(`Posts actor returned ${results.length} total items`);

  if (results.length > 0) {
    const sample = results[0] as Record<string, unknown>;
    log(`Sample post keys: ${Object.keys(sample).join(", ")}`);
    const dateField = extractDateField(sample);
    if (dateField) {
      log(`Date field found: "${dateField.key}" = ${JSON.stringify(dateField.raw)} (type: ${typeof dateField.raw})`);
    }
    log(`numShares: ${sample.numShares}, numLikes: ${sample.numLikes}, numComments: ${sample.numComments}`);
  }

  const posts: ScrapedPost[] = [];
  let skippedNoUrl = 0;
  let skippedNoDate = 0;
  let skippedTooOld = 0;
  let skippedRepost = 0;

  for (const item of results) {
    const post = item as Record<string, unknown>;

    // Skip reposts — we only care about original posts by the contact
    if (post.isActivity === true) {
      skippedRepost++;
      continue;
    }

    const postUrl = (post.url || post.postUrl || post.shareUrl) as string | undefined;

    if (!postUrl) {
      skippedNoUrl++;
      continue;
    }

    const dateField = extractDateField(post);
    const parsedDate = dateField ? parsePostDate(dateField.raw) : null;

    if (!parsedDate) {
      skippedNoDate++;
      continue;
    }

    if (!isRecentPost(parsedDate, hoursBack)) {
      skippedTooOld++;
      continue;
    }

    posts.push({
      postUrl,
      postedDate: parsedDate.toISOString(),
      numLikes: (post.numLikes as number) || 0,
      numComments: (post.numComments as number) || 0,
      numShares: (post.numShares as number) || 0,
    });
  }

  log(
    `Found ${posts.length} original posts from the last ${hoursBack} hours (out of ${results.length} total). ` +
      `Skipped: ${skippedRepost} reposts, ${skippedNoUrl} no URL, ${skippedNoDate} no/unparseable date, ${skippedTooOld} older than ${hoursBack} hours`,
  );
  return posts;
}

/**
 * Scrape ALL reactions for a post. Handles pagination (100 per page).
 */
export async function scrapePostReactions(postUrl: string, signal?: AbortSignal, runId?: string, engagedAt?: Date): Promise<EngagedPerson[]> {
  const allResults = await runApifyActorPaginated(REACTIONS_ACTOR_ID, { post_urls: [postUrl] }, signal, 5, runId);

  if (allResults.length > 0) {
    for (let i = 0; i < Math.min(3, allResults.length); i++) {
      log(`Raw reaction[${i}]: ${JSON.stringify(allResults[i]).slice(0, 1500)}`);
    }
  }

  return normalizeEngagers(allResults, "reaction", postUrl, engagedAt ?? new Date());
}

/**
 * Scrape ALL comments for a post. Handles pagination (100 per page).
 */
export async function scrapePostComments(postUrl: string, signal?: AbortSignal, runId?: string, engagedAt?: Date): Promise<EngagedPerson[]> {
  const allResults = await runApifyActorPaginated(COMMENTS_ACTOR_ID, { postIds: [postUrl] }, signal, 5, runId);

  if (allResults.length > 0) {
    const sample = allResults[0] as Record<string, unknown>;
    log(`Comments sample keys: ${Object.keys(sample).join(", ")}`);
  }

  return normalizeEngagers(allResults, "comment", postUrl, engagedAt ?? new Date());
}

/**
 * Scrape ALL reshares/reposts for a post. Handles pagination (100 per page).
 */
export async function scrapePostReshares(postUrl: string, signal?: AbortSignal, runId?: string, engagedAt?: Date): Promise<EngagedPerson[]> {
  const allResults = await runApifyActorPaginated(RESHARES_ACTOR_ID, { post_urls: [postUrl] }, signal, 5, runId);

  if (allResults.length > 0) {
    for (let i = 0; i < Math.min(3, allResults.length); i++) {
      log(`Raw reshare[${i}]: ${JSON.stringify(allResults[i]).slice(0, 1500)}`);
    }
  }

  return normalizeEngagers(allResults, "repost", postUrl, engagedAt ?? new Date());
}

/** Flatten nested author/user objects into the top-level record so field extraction works uniformly. */
function flattenResult(raw: Record<string, unknown>): Record<string, unknown> {
  const flat = { ...raw };
  for (const nested of ["author", "user", "reactor", "profile", "reposter"]) {
    const obj = raw[nested];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (flat[k] == null) flat[k] = v;
      }
    }
  }
  return flat;
}

function pickString(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const url = obj.medium || obj.small || obj.large || obj.original;
      if (typeof url === "string" && url) return url;
    }
  }
  return null;
}

export function normalizeEngagers(
  rawResults: unknown[],
  engagementType: "reaction" | "comment" | "repost",
  postUrl: string,
  engagedAt: Date,
): EngagedPerson[] {
  const people: EngagedPerson[] = [];

  let skippedNoUrl = 0;
  let skippedNotPersonal = 0;
  let skippedNoName = 0;

  for (const item of rawResults) {
    const raw = item as Record<string, unknown>;
    const r = flattenResult(raw);

    let profileUrl = pickString(
      r,
      "profileUrl",
      "linkedinUrl",
      "profileLink",
      "profile_url",
      "linkedin_url",
      "actorUrl",
      "url",
      "link",
    );
    if (!profileUrl) {
      if (skippedNoUrl === 0) {
        log(`  Skip (no URL) example - flat keys: ${Object.keys(r).join(", ")}`);
      }
      skippedNoUrl++;
      continue;
    }
    if (!profileUrl.includes("linkedin.com/in/")) {
      if (skippedNotPersonal === 0) {
        log(`  Skip (not /in/ profile) example URL: ${profileUrl}`);
      }
      skippedNotPersonal++;
      continue;
    }

    // Strip query params from LinkedIn URLs (e.g. ?miniProfileUrn=...)
    try {
      const parsed = new URL(profileUrl);
      profileUrl = `${parsed.origin}${parsed.pathname}`;
    } catch {
      // If URL parsing fails, just strip everything after ?
      const qIdx = profileUrl.indexOf("?");
      if (qIdx > 0) profileUrl = profileUrl.slice(0, qIdx);
    }

    // Extract name
    const fullName =
      pickString(r, "name", "fullName", "full_name", "authorName", "author_name") ||
      [pickString(r, "firstName", "first_name"), pickString(r, "lastName", "last_name")].filter(Boolean).join(" ");
    if (!fullName) {
      skippedNoName++;
      continue;
    }

    const { firstName, lastName } = splitName(fullName);
    const urn = isUrnUrl(profileUrl);
    const slug = urn ? null : extractLinkedinSlug(profileUrl);

    people.push({
      firstName,
      lastName,
      linkedinUrl: profileUrl,
      linkedinUrnUrl: urn ? profileUrl : null,
      linkedinSlug: slug,
      headline: pickString(r, "headline", "title", "tagline", "occupation"),
      company: pickString(r, "company", "companyName", "company_name", "organization"),
      profileImageUrl: pickString(
        r,
        "profileImageUrl",
        "profilePicture",
        "profile_pictures",
        "profile_image_url",
        "avatar",
        "image",
        "picture",
      ),
      engagementType,
      postUrl,
      engagedAt,
    });
  }

  log(
    `Normalized ${people.length} engagers from ${rawResults.length} results (${engagementType}). ` +
      `Skipped: ${skippedNoUrl} no URL, ${skippedNotPersonal} not personal profile, ${skippedNoName} no name`,
  );
  return people;
}
