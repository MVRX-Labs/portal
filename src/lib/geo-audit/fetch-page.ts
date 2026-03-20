import * as cheerio from "cheerio";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "CCBot",
  "Bytespider",
  "cohere-ai",
  "Google-Extended",
  "GoogleOther",
  "Applebot-Extended",
  "FacebookBot",
  "Amazonbot",
];

export interface PageAnalysis {
  url: string;
  statusCode: number | null;
  redirectChain: { url: string; status: number }[];
  title: string | null;
  description: string | null;
  canonical: string | null;
  metaTags: Record<string, string>;
  h1Tags: string[];
  headingStructure: { level: number; text: string }[];
  wordCount: number;
  textContent: string;
  internalLinks: { url: string; text: string }[];
  externalLinks: { url: string; text: string }[];
  images: { src: string; alt: string; width?: string; height?: string; loading?: string }[];
  structuredData: unknown[];
  securityHeaders: Record<string, string | null>;
  hasSsrContent: boolean;
  errors: string[];
}

export interface RobotsAnalysis {
  url: string;
  exists: boolean;
  content: string;
  aiCrawlerStatus: Record<string, string>;
  sitemaps: string[];
  errors: string[];
}

export interface LlmsTxtAnalysis {
  llmsTxt: { url: string; exists: boolean; content: string };
  llmsFullTxt: { url: string; exists: boolean; content: string };
  errors: string[];
}

export interface SitemapResult {
  pages: string[];
  count: number;
}

async function safeFetch(url: string, timeout = 30000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    return resp;
  } catch {
    return null;
  }
}

export async function fetchPage(url: string): Promise<PageAnalysis> {
  const result: PageAnalysis = {
    url,
    statusCode: null,
    redirectChain: [],
    title: null,
    description: null,
    canonical: null,
    metaTags: {},
    h1Tags: [],
    headingStructure: [],
    wordCount: 0,
    textContent: "",
    internalLinks: [],
    externalLinks: [],
    images: [],
    structuredData: [],
    securityHeaders: {},
    hasSsrContent: true,
    errors: [],
  };

  const resp = await safeFetch(url);
  if (!resp) {
    result.errors.push("Failed to fetch page");
    return result;
  }

  result.statusCode = resp.status;

  // Security headers
  for (const h of [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) {
    result.securityHeaders[h] = resp.headers.get(h);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Title
  result.title = $("title").first().text().trim() || null;

  // Meta tags
  $("meta").each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("property") || "";
    const content = $(el).attr("content") || "";
    if (name && content) {
      result.metaTags[name.toLowerCase()] = content;
      if (name.toLowerCase() === "description") result.description = content;
    }
  });

  // Canonical
  const canonical = $('link[rel="canonical"]').attr("href");
  result.canonical = canonical || null;

  // Headings
  for (let level = 1; level <= 6; level++) {
    $(`h${level}`).each((_, el) => {
      const text = $(el).text().trim();
      result.headingStructure.push({ level, text });
      if (level === 1) result.h1Tags.push(text);
    });
  }

  // Structured data (JSON-LD)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      result.structuredData.push(data);
    } catch {
      result.errors.push("Invalid JSON-LD detected");
    }
  });

  // SSR check
  const jsAppRoots = $("#app, #root, #__next, #__nuxt");
  if (jsAppRoots.length > 0) {
    jsAppRoots.each((_, el) => {
      if ($(el).text().trim().length < 50) {
        result.hasSsrContent = false;
        result.errors.push(
          `Possible client-side only rendering: #${$(el).attr("id") || "unknown"} has minimal server-rendered content`
        );
      }
    });
  }

  // Strip non-content elements for text extraction and link analysis
  $("script, style, nav, footer, header").remove();

  // Text content
  result.textContent = $.root().text().replace(/\s+/g, " ").trim();
  result.wordCount = result.textContent.split(/\s+/).filter(Boolean).length;

  // Links
  const baseDomain = new URL(url).hostname;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const linkText = $(el).text().trim();
    try {
      const resolved = new URL(href, url).toString();
      const parsedHref = new URL(resolved);
      if (parsedHref.hostname === baseDomain) {
        result.internalLinks.push({ url: resolved, text: linkText });
      } else if (parsedHref.protocol === "http:" || parsedHref.protocol === "https:") {
        result.externalLinks.push({ url: resolved, text: linkText });
      }
    } catch {
      // invalid URL, skip
    }
  });

  // Images
  $("img").each((_, el) => {
    result.images.push({
      src: $(el).attr("src") || "",
      alt: $(el).attr("alt") || "",
      width: $(el).attr("width"),
      height: $(el).attr("height"),
      loading: $(el).attr("loading"),
    });
  });

  return result;
}

export async function fetchRobotsTxt(url: string): Promise<RobotsAnalysis> {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.protocol}//${parsed.hostname}/robots.txt`;

  const result: RobotsAnalysis = {
    url: robotsUrl,
    exists: false,
    content: "",
    aiCrawlerStatus: {},
    sitemaps: [],
    errors: [],
  };

  const resp = await safeFetch(robotsUrl, 15000);
  if (!resp) {
    result.errors.push("Failed to fetch robots.txt");
    for (const crawler of AI_CRAWLERS) result.aiCrawlerStatus[crawler] = "FETCH_ERROR";
    return result;
  }

  if (resp.status === 200) {
    result.exists = true;
    result.content = await resp.text();

    const lines = result.content.split("\n");
    let currentAgent: string | null = null;
    const agentRules: Record<string, { directive: string; path: string }[]> = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.toLowerCase().startsWith("user-agent:")) {
        currentAgent = line.split(":").slice(1).join(":").trim();
        if (!agentRules[currentAgent]) agentRules[currentAgent] = [];
      } else if (line.toLowerCase().startsWith("disallow:") && currentAgent) {
        agentRules[currentAgent].push({ directive: "Disallow", path: line.split(":").slice(1).join(":").trim() });
      } else if (line.toLowerCase().startsWith("allow:") && currentAgent) {
        agentRules[currentAgent].push({ directive: "Allow", path: line.split(":").slice(1).join(":").trim() });
      } else if (line.toLowerCase().startsWith("sitemap:")) {
        const sitemapUrl = line.split(":").slice(1).join(":").trim();
        if (sitemapUrl) result.sitemaps.push(sitemapUrl);
      }
    }

    for (const crawler of AI_CRAWLERS) {
      if (agentRules[crawler]) {
        const rules = agentRules[crawler];
        if (rules.some((r) => r.directive === "Disallow" && r.path === "/")) {
          result.aiCrawlerStatus[crawler] = "BLOCKED";
        } else if (rules.some((r) => r.directive === "Disallow" && r.path)) {
          result.aiCrawlerStatus[crawler] = "PARTIALLY_BLOCKED";
        } else {
          result.aiCrawlerStatus[crawler] = "ALLOWED";
        }
      } else if (agentRules["*"]) {
        const wildcard = agentRules["*"];
        if (wildcard.some((r) => r.directive === "Disallow" && r.path === "/")) {
          result.aiCrawlerStatus[crawler] = "BLOCKED_BY_WILDCARD";
        } else {
          result.aiCrawlerStatus[crawler] = "ALLOWED_BY_DEFAULT";
        }
      } else {
        result.aiCrawlerStatus[crawler] = "NOT_MENTIONED";
      }
    }
  } else if (resp.status === 404) {
    result.errors.push("No robots.txt found (404)");
    for (const crawler of AI_CRAWLERS) result.aiCrawlerStatus[crawler] = "NO_ROBOTS_TXT";
  } else {
    result.errors.push(`Unexpected status code: ${resp.status}`);
  }

  return result;
}

export async function fetchLlmsTxt(url: string): Promise<LlmsTxtAnalysis> {
  const parsed = new URL(url);
  const base = `${parsed.protocol}//${parsed.hostname}`;
  const llmsUrl = `${base}/llms.txt`;
  const llmsFullUrl = `${base}/llms-full.txt`;

  const result: LlmsTxtAnalysis = {
    llmsTxt: { url: llmsUrl, exists: false, content: "" },
    llmsFullTxt: { url: llmsFullUrl, exists: false, content: "" },
    errors: [],
  };

  for (const [key, checkUrl] of [
    ["llmsTxt", llmsUrl],
    ["llmsFullTxt", llmsFullUrl],
  ] as const) {
    const resp = await safeFetch(checkUrl, 15000);
    if (resp && resp.status === 200) {
      const k = key as "llmsTxt" | "llmsFullTxt";
      result[k].exists = true;
      result[k].content = await resp.text();
    }
  }

  return result;
}

export async function crawlSitemap(url: string, maxPages = 20): Promise<SitemapResult> {
  const parsed = new URL(url);
  const sitemapUrls = [
    `${parsed.protocol}//${parsed.hostname}/sitemap.xml`,
    `${parsed.protocol}//${parsed.hostname}/sitemap_index.xml`,
  ];

  const discovered = new Set<string>();

  for (const sitemapUrl of sitemapUrls) {
    const resp = await safeFetch(sitemapUrl, 15000);
    if (!resp || resp.status !== 200) continue;

    const xml = await resp.text();
    const $ = cheerio.load(xml, { xml: true });

    // Handle sitemap index
    $("sitemap > loc").each((_, el) => {
      // We'd need to fetch child sitemaps — skip for now, use direct URLs
    });

    // Direct URLs
    $("url > loc").each((_, el) => {
      if (discovered.size < maxPages) {
        discovered.add($(el).text().trim());
      }
    });

    if (discovered.size > 0) break;
  }

  return { pages: Array.from(discovered), count: discovered.size };
}
