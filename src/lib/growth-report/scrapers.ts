import { logger } from "@trigger.dev/sdk/v3";
import type { DiscoveryResult } from "./discovery";
import { AI_BOTS } from "./constants";

const APIFY_BASE = "https://api.apify.com/v2";

// Existing actor IDs (already in codebase)
const LI_PROFILE_ACTOR = "VhxlqQXRwhW8H5hNV";
const LI_POSTS_ACTOR = "Wpp1BZ6yGWjySadk3";
const GOOGLE_SERP_ACTOR = "nFJndFXA5zjCTuudP";
const REDDIT_ACTOR = "trudax/reddit-scraper-lite";

// New actor IDs
const SIMILARWEB_ACTOR = "ecomdate/similarweb-scraper";
const AHREFS_ACTOR = "radeance/ahrefs-scraper";
const SEO_AUDIT_ACTOR = "UFSUQD7pWNwN3jExC";
const IG_PROFILE_ACTOR = "apify/instagram-profile-scraper";
const TIKTOK_PROFILE_ACTOR = "clockworks/tiktok-profile-scraper";
const TRUSTPILOT_ACTOR = "casper11515/trustpilot-reviews-scraper";

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) throw new Error("Missing APIFY_API_TOKEN");
  return t;
}

async function apify(actorId: string, input: unknown, label: string): Promise<unknown> {
  const encodedId = actorId.includes("/") ? actorId.replace("/", "~") : actorId;
  const url = `${APIFY_BASE}/acts/${encodedId}/run-sync-get-dataset-items?token=${token()}`;
  logger.info(`Scraper start: ${label}`, { actorId });
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  logger.info(`Scraper done: ${label} (${elapsed}s)`, { actorId });
  return res.json();
}

// --- Individual scrapers ---

export function scrapeSimilarWeb(domains: string[]) {
  // ecomdate/similarweb-scraper expects bare domains (no protocol)
  const cleaned = domains.map((d) => d.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  return apify(SIMILARWEB_ACTOR, { domains: cleaned }, "SimilarWeb");
}

export function scrapeAhrefs(urls: string[]) {
  // radeance/ahrefs-scraper returns backlinks, authority, and traffic data
  const withProtocol = urls.map((u) => (u.startsWith("http") ? u : `https://${u}`));
  return apify(AHREFS_ACTOR, { urls: withProtocol, searchMode: "domain_overview" }, "Ahrefs");
}

export function scrapeSeoAudit(websiteUrl: string) {
  const fullUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
  return apify(SEO_AUDIT_ACTOR, { startUrls: [{ url: fullUrl }], maxPagesPerCrawl: 20 }, "SEO Audit");
}

export function scrapeLinkedInProfile(url: string) {
  const match = url.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/);
  const slug = match?.[1] || url;
  return Promise.all([
    apify(LI_PROFILE_ACTOR, { username: slug }, `LI Profile: ${slug}`),
    apify(LI_POSTS_ACTOR, { urls: [url], limitPerSource: 20, deepScrape: true }, `LI Posts: ${slug}`),
  ]).then(([profile, posts]) => ({ profile, posts }));
}

export function scrapeInstagram(handle: string) {
  return apify(IG_PROFILE_ACTOR, { usernames: [handle] }, `Instagram: ${handle}`);
}

export function scrapeTikTok(handle: string) {
  return apify(TIKTOK_PROFILE_ACTOR, { profiles: [handle] }, `TikTok: ${handle}`);
}

export function scrapeGoogleSerp(queries: string[]) {
  return apify(GOOGLE_SERP_ACTOR, { queries: queries.join("\n"), maxPagesPerQuery: 1, resultsPerPage: 10 }, "SERP");
}

export function scrapeTrustpilot(url: string) {
  return apify(TRUSTPILOT_ACTOR, { urls: [url], maxReviews: 5 }, "Trustpilot");
}

// Crunchbase/Tracxn scrapers removed — all available Apify actors are
// broken, expired, or require paid subscriptions. Company funding data
// is now gathered by the Claude discovery phase via web research.

export function scrapeReddit(brandName: string) {
  // trudax/reddit-scraper-lite — lightweight, no rental required
  return apify(REDDIT_ACTOR, { searches: [brandName], maxItems: 50, sort: "relevance", time: "all" }, "Reddit");
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
  trustpilot: unknown;
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
  if (p.discovery.trustpilotUrl) jobs.push(["trustpilot", scrapeTrustpilot(p.discovery.trustpilotUrl)]);

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
    trustpilot: data.trustpilot ?? null,
    reddit: data.reddit ?? null,
    failures,
  };
}
