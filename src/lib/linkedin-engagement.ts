const APIFY_BASE = "https://api.apify.com/v2";
const POSTS_ACTOR_ID = "Wpp1BZ6yGWjySadk3";
const COMMENTS_ACTOR_ID =
  "apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies";

function log(message: string) {
  console.log(`[linkedin-engagement] ${message}`);
}

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

async function runApifyActor(
  actorId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<unknown[]> {
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
    throw new Error(
      `Apify actor ${actorId} failed (${res.status}): ${body.slice(0, 500)}`
    );
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Apify actor ${actorId} completed in ${elapsed}s`);

  return (await res.json()) as unknown[];
}

export interface EngagedPerson {
  firstName: string;
  lastName: string | null;
  linkedinUrl: string;
  linkedinSlug: string | null;
  headline: string | null;
  company: string | null;
  profileImageUrl: string | null;
  engagementType: "reaction" | "comment" | "repost";
  postUrl: string;
}

function extractLinkedinSlug(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1] : null;
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

  // Unix timestamp in seconds or milliseconds
  if (typeof raw === "number") {
    return new Date(raw < 1e12 ? raw * 1000 : raw);
  }

  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Try ISO / standard date string first
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

function isRecentPost(parsedDate: Date | null, daysAgo: number): boolean {
  if (!parsedDate) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);
  return parsedDate >= cutoff;
}

/** Grab the date value from a post object, trying common field names. */
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
  reactions: EngagedPerson[];
}

export async function scrapeRecentPosts(
  linkedinUrl: string,
  signal?: AbortSignal
): Promise<ScrapedPost[]> {
  const results = await runApifyActor(
    POSTS_ACTOR_ID,
    {
      urls: [linkedinUrl],
      limitPerSource: 20,
      deepScrape: true,
      scrapeReactions: true,
    },
    signal
  );

  // Log the keys from the first result so we can see what the actor returns
  if (results.length > 0) {
    const sample = results[0] as Record<string, unknown>;
    log(`Sample post keys: ${Object.keys(sample).join(", ")}`);
    const dateField = extractDateField(sample);
    if (dateField) {
      log(`Date field found: "${dateField.key}" = ${JSON.stringify(dateField.raw)} (type: ${typeof dateField.raw})`);
    } else {
      log(`No recognized date field found. Values: ${JSON.stringify(sample, null, 2).slice(0, 1000)}`);
    }
  }

  const posts: ScrapedPost[] = [];
  let skippedNoUrl = 0;
  let skippedNoDate = 0;
  let skippedTooOld = 0;
  let totalReactors = 0;

  for (const item of results) {
    const post = item as Record<string, unknown>;
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

    if (!isRecentPost(parsedDate, 7)) {
      skippedTooOld++;
      continue;
    }

    // Extract reactors from embedded reactions array
    // Each reaction has: { type, profile: { firstName, lastName, publicId, occupation, picture, ... } }
    const reactions: EngagedPerson[] = [];
    const rawReactions = post.reactions;
    if (Array.isArray(rawReactions)) {
      for (const rx of rawReactions) {
        const r = rx as Record<string, unknown>;
        const profile = r.profile as Record<string, unknown> | undefined;
        if (!profile) continue;

        const publicId = profile.publicId as string | undefined;
        if (!publicId) continue;

        const profileUrl = `https://www.linkedin.com/in/${publicId}`;
        const firstName = (profile.firstName as string) || "Unknown";
        const lastName = (profile.lastName as string) || null;

        reactions.push({
          firstName,
          lastName,
          linkedinUrl: profileUrl,
          linkedinSlug: publicId,
          headline: (profile.occupation as string) || null,
          company: null,
          profileImageUrl: (profile.picture as string) || null,
          engagementType: "reaction",
          postUrl,
        });
      }
      totalReactors += reactions.length;
    }

    posts.push({ postUrl, postedDate: parsedDate.toISOString(), reactions });
  }

  log(
    `Found ${posts.length} posts from the last 7 days (out of ${results.length} total) with ${totalReactors} reactors. ` +
      `Skipped: ${skippedNoUrl} no URL, ${skippedNoDate} no/unparseable date, ${skippedTooOld} older than 7 days`
  );
  return posts;
}

export async function scrapePostComments(
  postUrl: string,
  signal?: AbortSignal
): Promise<EngagedPerson[]> {
  const results = await runApifyActor(
    COMMENTS_ACTOR_ID,
    { postIds: [postUrl] },
    signal
  );

  if (results.length > 0) {
    const sample = results[0] as Record<string, unknown>;
    log(`Comments sample keys: ${Object.keys(sample).join(", ")}`);
  }

  return normalizeEngagers(results, "comment", postUrl);
}

/** Flatten nested author/user objects into the top-level record so field extraction works uniformly. */
function flattenResult(raw: Record<string, unknown>): Record<string, unknown> {
  const flat = { ...raw };
  // Many actors nest person data under "author", "user", "reactor", or "profile"
  for (const nested of ["author", "user", "reactor", "profile"]) {
    const obj = raw[nested];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      // Spread nested fields, but don't overwrite existing top-level ones
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
    // Handle nested picture objects like { small, medium, large }
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
  postUrl: string
): EngagedPerson[] {
  const people: EngagedPerson[] = [];

  // Log first raw result for debugging
  if (rawResults.length > 0) {
    log(`First raw ${engagementType} result: ${JSON.stringify(rawResults[0]).slice(0, 800)}`);
  }

  let skippedNoUrl = 0;
  let skippedNotPersonal = 0;
  let skippedNoName = 0;

  for (const item of rawResults) {
    const raw = item as Record<string, unknown>;
    const r = flattenResult(raw);

    // Extract profile URL - actors use different field names
    const profileUrl = pickString(r,
      "profileUrl", "linkedinUrl", "profileLink", "profile_url",
      "linkedin_url", "actorUrl", "url", "link"
    );
    if (!profileUrl) {
      skippedNoUrl++;
      continue;
    }
    if (!profileUrl.includes("linkedin.com/in/")) {
      skippedNotPersonal++;
      continue;
    }
    // Skip URN-style URLs (e.g. /in/ACoAAA...) — not real public profile slugs
    if (/\/in\/ACo[A-Z]/i.test(profileUrl)) {
      skippedNotPersonal++;
      continue;
    }

    // Extract name
    const fullName = pickString(r,
      "name", "fullName", "full_name", "authorName", "author_name"
    ) || [
      pickString(r, "firstName", "first_name"),
      pickString(r, "lastName", "last_name"),
    ].filter(Boolean).join(" ");
    if (!fullName) {
      skippedNoName++;
      continue;
    }

    const { firstName, lastName } = splitName(fullName);
    const slug = extractLinkedinSlug(profileUrl);

    people.push({
      firstName,
      lastName,
      linkedinUrl: profileUrl,
      linkedinSlug: slug,
      headline: pickString(r, "headline", "title", "tagline", "occupation"),
      company: pickString(r, "company", "companyName", "company_name", "organization"),
      profileImageUrl: pickString(r, "profileImageUrl", "profilePicture", "profile_image_url", "avatar", "image", "picture"),
      engagementType,
      postUrl,
    });
  }

  log(
    `Normalized ${people.length} engagers from ${rawResults.length} results (${engagementType}). ` +
      `Skipped: ${skippedNoUrl} no URL, ${skippedNotPersonal} not personal profile, ${skippedNoName} no name`
  );
  return people;
}
