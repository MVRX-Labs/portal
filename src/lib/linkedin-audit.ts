import { runApifyActor } from "@/lib/apify";

const POSTS_ACTOR_ID = "Wpp1BZ6yGWjySadk3";
const PROFILE_ACTOR_ID = "VhxlqQXRwhW8H5hNV";

function log(message: string) {
  console.log(`[linkedin-audit:scrape] ${message}`);
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
    runApifyActor(PROFILE_ACTOR_ID, { username: slug }, { signal, label: `LI Audit Profile: ${slug}`, log }),
    runApifyActor(
      POSTS_ACTOR_ID,
      { urls: [linkedinUrl], limitPerSource: 100, deepScrape: true },
      { signal, label: `LI Audit Posts: ${slug}`, log }
    ),
  ]);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Scraping complete for "${slug}" in ${elapsed}s`);

  return { slug, profileData, postsData };
}
