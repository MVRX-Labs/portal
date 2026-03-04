const APIFY_BASE = "https://api.apify.com/v2";
const POSTS_ACTOR_ID = "Wpp1BZ6yGWjySadk3";
const PROFILE_ACTOR_ID = "VhxlqQXRwhW8H5hNV";

function log(message: string) {
  console.log(`[linkedin-audit:scrape] ${message}`);
}

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

async function runApifyActor(actorId: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
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

  return res.json();
}

export function extractSlug(linkedinUrl: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Could not extract LinkedIn slug from URL: ${linkedinUrl}`);
  }
  return match[1];
}

export interface ScrapedLinkedInData {
  slug: string;
  profileData: unknown;
  postsData: unknown;
}

export async function scrapeLinkedInProfile(linkedinUrl: string, signal?: AbortSignal): Promise<ScrapedLinkedInData> {
  const slug = extractSlug(linkedinUrl);
  log(`Scraping profile for slug "${slug}" — running profile + posts actors in parallel...`);
  const start = Date.now();

  const [profileData, postsData] = await Promise.all([
    runApifyActor(PROFILE_ACTOR_ID, { username: slug }, signal),
    runApifyActor(
      POSTS_ACTOR_ID,
      {
        urls: [linkedinUrl],
        limitPerSource: 20,
        deepScrape: true,
      },
      signal
    ),
  ]);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Scraping complete for "${slug}" in ${elapsed}s`);

  return { slug, profileData, postsData };
}
