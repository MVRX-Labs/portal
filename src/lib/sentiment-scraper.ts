const APIFY_BASE = "https://api.apify.com/v2";

// Apify actor IDs
const GOOGLE_SEARCH_ACTOR = "nFJndFXA5zjCTuudP"; // Google Search Results Scraper
const REDDIT_SCRAPER_ACTOR = "oKbfaRlpOJ4bubyBN"; // Reddit Scraper Lite
const GOOGLE_MAPS_ACTOR = "compass/Google-Maps-Reviews-Scraper"; // Google Maps Reviews
const WEB_SCRAPER_ACTOR = "aYG0l9s7dbB7j3gbS"; // Cheerio Scraper (web pages)

function log(message: string) {
  console.log(`[sentiment-scraper] ${message}`);
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
): Promise<unknown> {
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

  return res.json();
}

export type SourceType = "all" | "reddit" | "reviews" | "google" | "web";

export interface ScrapedSource {
  platform: string;
  data: unknown;
}

export interface SentimentScrapedData {
  productName: string;
  companyName: string;
  sources: ScrapedSource[];
}

async function scrapeGoogleSearch(
  productName: string,
  companyName: string,
  signal?: AbortSignal
): Promise<ScrapedSource> {
  const queries = [
    `${productName} review`,
    `${productName} ${companyName} user experience`,
    `${productName} pros cons`,
  ];

  const data = await runApifyActor(
    GOOGLE_SEARCH_ACTOR,
    {
      queries: queries.join("\n"),
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
    },
    signal
  );

  return { platform: "google-search", data };
}

async function scrapeReddit(
  productName: string,
  signal?: AbortSignal
): Promise<ScrapedSource> {
  const data = await runApifyActor(
    REDDIT_SCRAPER_ACTOR,
    {
      searches: [
        `${productName} review`,
        `${productName} experience`,
        `${productName} alternative`,
      ],
      maxItems: 30,
      sort: "relevance",
      time: "year",
    },
    signal
  );

  return { platform: "reddit", data };
}

async function scrapeGoogleReviews(
  productName: string,
  companyName: string,
  signal?: AbortSignal
): Promise<ScrapedSource> {
  const data = await runApifyActor(
    GOOGLE_MAPS_ACTOR,
    {
      searchStringsArray: [`${productName} ${companyName}`],
      maxReviews: 50,
      language: "en",
    },
    signal
  );

  return { platform: "google-reviews", data };
}

async function scrapeWebUrls(
  urls: string[],
  signal?: AbortSignal
): Promise<ScrapedSource> {
  const startUrls = urls.map((url) => ({ url }));

  const data = await runApifyActor(
    WEB_SCRAPER_ACTOR,
    {
      startUrls,
      maxCrawlingDepth: 0,
      maxPagesPerCrawl: urls.length,
    },
    signal
  );

  return { platform: "web", data };
}

async function scrapeReviewSites(
  productName: string,
  signal?: AbortSignal
): Promise<ScrapedSource> {
  const reviewUrls = [
    `https://www.g2.com/search?utf8=%E2%9C%93&query=${encodeURIComponent(productName)}`,
    `https://www.capterra.com/search/?query=${encodeURIComponent(productName)}`,
  ];

  return scrapeWebUrls(reviewUrls, signal);
}

export async function scrapeSentimentSources(
  productName: string,
  companyName: string,
  sourceType: SourceType,
  additionalUrls: string[],
  signal?: AbortSignal
): Promise<SentimentScrapedData> {
  log(
    `Starting sentiment scrape for "${productName}" (${companyName}) — source: ${sourceType}, extra URLs: ${additionalUrls.length}`
  );
  const start = Date.now();

  const scrapers: Promise<ScrapedSource>[] = [];

  // Always run Google Search for discovery unless only Google Reviews selected
  if (sourceType !== "google") {
    scrapers.push(scrapeGoogleSearch(productName, companyName, signal));
  }

  // Source-specific scrapers
  if (sourceType === "all" || sourceType === "reddit") {
    scrapers.push(scrapeReddit(productName, signal));
  }

  if (sourceType === "all" || sourceType === "reviews") {
    scrapers.push(scrapeReviewSites(productName, signal));
  }

  if (sourceType === "all" || sourceType === "google") {
    scrapers.push(scrapeGoogleReviews(productName, companyName, signal));
  }

  if (sourceType === "all" || sourceType === "web") {
    // For "web" mode, Google Search results are the primary source — no extra action needed
  }

  // Scrape additional user-provided URLs
  if (additionalUrls.length > 0) {
    scrapers.push(scrapeWebUrls(additionalUrls, signal));
  }

  const results = await Promise.allSettled(scrapers);

  const sources: ScrapedSource[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      sources.push(result.value);
    } else {
      log(`Scraper failed (non-fatal): ${result.reason}`);
    }
  }

  if (sources.length === 0) {
    throw new Error("All scrapers failed — no data collected");
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(
    `Sentiment scrape complete in ${elapsed}s — ${sources.length} source(s) collected`
  );

  return { productName, companyName, sources };
}
