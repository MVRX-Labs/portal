import { logger } from "@trigger.dev/sdk/v3";
import { runApifyActor } from "@/lib/apify";
import type { DiscoveryResult, ScreenshotTarget } from "./discovery";
import { AI_BOTS } from "./constants";

const SCREENSHOT_ACTOR = "apify/screenshot-url";
const LI_PROFILE_ACTOR = "VhxlqQXRwhW8H5hNV";
const LI_POSTS_ACTOR = "Wpp1BZ6yGWjySadk3";
const GOOGLE_SERP_ACTOR = "nFJndFXA5zjCTuudP";
const REDDIT_ACTOR = "trudax/reddit-scraper-lite";
const SIMILARWEB_ACTOR = "ecomdate/similarweb-scraper";
const AHREFS_ACTOR = "radeance/ahrefs-scraper";
const SEO_AUDIT_ACTOR = "UFSUQD7pWNwN3jExC";
const IG_PROFILE_ACTOR = "apify/instagram-profile-scraper";
const TIKTOK_PROFILE_ACTOR = "clockworks/tiktok-profile-scraper";

const log = (message: string) => logger.info(message);

// --- Individual scrapers ---

export function scrapeSimilarWeb(domains: string[]) {
  const cleaned = domains.map((d) => d.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  return runApifyActor(SIMILARWEB_ACTOR, { domains: cleaned }, { label: "SimilarWeb", log });
}

export function scrapeAhrefs(urls: string[]) {
  const withProtocol = urls.map((u) => (u.startsWith("http") ? u : `https://${u}`));
  return runApifyActor(AHREFS_ACTOR, { urls: withProtocol, searchMode: "domain_overview" }, { label: "Ahrefs", log });
}

export function scrapeSeoAudit(websiteUrl: string) {
  const fullUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
  return runApifyActor(
    SEO_AUDIT_ACTOR,
    { startUrls: [{ url: fullUrl }], maxPagesPerCrawl: 20 },
    { label: "SEO Audit", log }
  );
}

export function scrapeLinkedInProfile(url: string) {
  const match = url.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/);
  const slug = match?.[1] || url;
  return Promise.all([
    runApifyActor(LI_PROFILE_ACTOR, { username: slug }, { label: `LI Profile: ${slug}`, log }),
    runApifyActor(
      LI_POSTS_ACTOR,
      { urls: [url], limitPerSource: 20, deepScrape: true },
      { label: `LI Posts: ${slug}`, log }
    ),
  ]).then(([profile, posts]) => ({ profile, posts }));
}

export function scrapeInstagram(handle: string) {
  return runApifyActor(IG_PROFILE_ACTOR, { usernames: [handle] }, { label: `Instagram: ${handle}`, log });
}

export function scrapeTikTok(handle: string) {
  return runApifyActor(TIKTOK_PROFILE_ACTOR, { profiles: [handle] }, { label: `TikTok: ${handle}`, log });
}

export function scrapeGoogleSerp(queries: string[]) {
  return runApifyActor(
    GOOGLE_SERP_ACTOR,
    { queries: queries.join("\n"), maxPagesPerQuery: 1, resultsPerPage: 10 },
    { label: "SERP", log }
  );
}

export function scrapeReddit(brandName: string) {
  return runApifyActor(
    REDDIT_ACTOR,
    { searches: [brandName], maxItems: 50, sort: "relevance", time: "all" },
    { label: "Reddit", log }
  );
}

// --- Direct fetches (no Apify) ---

export async function fetchAiVisibility(websiteUrl: string): Promise<{
  robotsTxt: string | null;
  llmsTxt: string | null;
  botStatuses: Array<{ bot: string; status: string; impact: string }>;
}> {
  const base = websiteUrl.replace(/\/$/, "");
  const ensureHttps = (u: string) => (u.startsWith("http") ? u : `https://${u}`);

  const [robotsRes, llmsRes] = await Promise.allSettled([
    fetch(ensureHttps(`${base}/robots.txt`), { redirect: "follow" }).then((r) => (r.ok ? r.text() : null)),
    fetch(ensureHttps(`${base}/llms.txt`), { redirect: "follow" }).then((r) => (r.ok ? r.text() : null)),
  ]);

  const robotsTxt = robotsRes.status === "fulfilled" ? robotsRes.value : null;
  const llmsTxt = llmsRes.status === "fulfilled" ? llmsRes.value : null;

  const botStatuses = AI_BOTS.map(({ name, impact }) => {
    if (!robotsTxt) return { bot: name, status: "\u2717 No robots.txt", impact };
    const lines = robotsTxt.toLowerCase();
    const botLower = name.toLowerCase();
    if (lines.includes(`user-agent: ${botLower}`) || lines.includes(`user-agent: *`)) {
      const blocked = lines.includes(`disallow: /`) && lines.includes(`user-agent: ${botLower}`);
      return { bot: name, status: blocked ? "\u2717 Blocked" : "\u2713 Allowed", impact };
    }
    return { bot: name, status: "\u2717 Not mentioned", impact };
  });

  return { robotsTxt, llmsTxt, botStatuses };
}

// --- Screenshots ---

export interface RawScreenshot extends ScreenshotTarget {
  screenshotUrl: string;
}

export async function screenshotPages(targets: ScreenshotTarget[]): Promise<RawScreenshot[]> {
  logger.info(`Taking screenshots for ${targets.length} pages (individual calls)`);

  const settled = await Promise.allSettled(
    targets.map((target) =>
      runApifyActor(
        SCREENSHOT_ACTOR,
        {
          urls: [{ url: target.url }],
          waitUntil: "networkidle2",
          delay: 2000,
          viewportWidth: 1280,
        },
        {
          label: `Screenshot: ${target.url}`,
          retries: 1,
          timeoutSecs: 600,
          skipCache: true,
          log,
        }
      ).then((items) => {
        const arr = items as Array<{ url?: string; screenshotUrl?: string }>;
        const screenshotUrl = arr[0]?.screenshotUrl;
        if (!screenshotUrl) throw new Error(`No screenshotUrl in response for ${target.url}`);
        return { ...target, screenshotUrl } as RawScreenshot;
      })
    )
  );

  const results: RawScreenshot[] = [];
  const failures: string[] = [];

  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push(`${targets[i].url}: ${errorMsg}`);
      logger.error(`Screenshot failed for ${targets[i].url}`, { error: errorMsg });
    }
  });

  if (failures.length > 0) {
    logger.warn(`Screenshots: ${failures.length}/${targets.length} failed`, { failures });
  }

  logger.info(`Screenshots complete: ${results.length}/${targets.length} succeeded`);
  return results;
}

// --- Orchestrator ---

export interface ScrapedData {
  similarweb: unknown;
  ahrefs: unknown;
  seoAudit: unknown;
  linkedinCompany: unknown;
  linkedinPeople: Array<{ name: string; data: unknown }>;
  instagram: unknown;
  tiktok: unknown;
  aiVisibility: unknown;
  serpResults: unknown;
  reddit: unknown;
  failures: string[];
}

interface CollectParams {
  websiteUrl: string;
  companyName: string;
  companyLinkedinUrl: string | null;
  contacts: Array<{ name: string; linkedinUrl: string }>;
  discovery: DiscoveryResult;
}

export async function collectAllData(p: CollectParams): Promise<ScrapedData> {
  logger.info("Phase 2: Starting parallel data collection");
  const allUrls = [p.websiteUrl, ...p.discovery.competitors];
  const sh = p.discovery.socialHandles;
  const failures: string[] = [];

  type Entry = [string, Promise<unknown>];
  const jobs: Entry[] = [
    ["similarweb", scrapeSimilarWeb(allUrls)],
    ["ahrefs", scrapeAhrefs(allUrls)],
    ["seoAudit", scrapeSeoAudit(p.websiteUrl)],
    ["serpResults", scrapeGoogleSerp(p.discovery.searchQueries)],
    ["reddit", scrapeReddit(p.companyName)],
    ["aiVisibility", fetchAiVisibility(p.websiteUrl)],
  ];

  if (p.companyLinkedinUrl) jobs.push(["linkedinCompany", scrapeLinkedInProfile(p.companyLinkedinUrl)]);
  if (sh.instagram) jobs.push(["instagram", scrapeInstagram(sh.instagram)]);
  if (sh.tiktok) jobs.push(["tiktok", scrapeTikTok(sh.tiktok)]);
  const liPeopleJobs = p.contacts.map((c) => ({
    name: c.name,
    promise: scrapeLinkedInProfile(c.linkedinUrl),
  }));

  const [mainResults, ...peopleResults] = await Promise.all([
    Promise.allSettled(jobs.map(([, p]) => p)),
    ...liPeopleJobs.map((j) =>
      j.promise.catch((e: Error) => {
        failures.push(`LinkedIn ${j.name}: ${e.message}`);
        return null;
      })
    ),
  ]);

  const data: Record<string, unknown> = {};
  mainResults.forEach((r, i) => {
    const key = jobs[i][0];
    if (r.status === "fulfilled") {
      data[key] = r.value;
    } else {
      failures.push(`${key}: ${r.reason?.message || r.reason}`);
      logger.warn(`Scraper failed: ${key}`, { error: r.reason?.message });
    }
  });

  const linkedinPeople = liPeopleJobs
    .map((j, i) => ({
      name: j.name,
      data: peopleResults[i],
    }))
    .filter((p) => p.data !== null);

  logger.info("Phase 2 complete", { scrapers: jobs.length, people: liPeopleJobs.length, failures: failures.length });

  return {
    similarweb: data.similarweb ?? null,
    ahrefs: data.ahrefs ?? null,
    seoAudit: data.seoAudit ?? null,
    linkedinCompany: data.linkedinCompany ?? null,
    linkedinPeople,
    instagram: data.instagram ?? null,
    tiktok: data.tiktok ?? null,
    aiVisibility: data.aiVisibility ?? null,
    serpResults: data.serpResults ?? null,
    reddit: data.reddit ?? null,
    failures,
  };
}
