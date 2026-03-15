import { runClaudeAgent } from "../claude-agent";
import { extractJSON, MODEL_MAP } from "../audit-utils";
import { logger } from "@trigger.dev/sdk/v3";
import { tmpdir } from "os";

export interface ScreenshotTarget {
  url: string;
  context: string;
  section: string;
}

export interface DiscoveryResult {
  competitors: string[];
  searchQueries: string[];
  socialHandles: {
    instagram?: string;
    tiktok?: string;
    pinterest?: string;
    twitter?: string;
    youtube?: string;
  };
  trustpilotUrl: string | null;
  screenshotTargets?: ScreenshotTarget[];
}

function buildDiscoveryPrompt(websiteUrl: string, companyName: string, industry: string | null): string {
  return `\
You are a market researcher at MVRX Labs preparing a comprehensive SEO & growth report for "${companyName}" (${websiteUrl}).
${industry ? `Industry: ${industry}` : ""}

Your job is to research and discover key information we need before running our data scrapers. Do the following:

## 1. Find Competitors (5-6 websites)
- Search for "${companyName} competitors", "${companyName} alternatives", and similar queries
- Identify companies in the same market with similar positioning
- Look for direct competitors (same product/service category) and aspirational competitors (larger players in the space)
- Return their root domain names (e.g. "competitor.com")

## 2. Generate Category Search Queries (4-6 queries)
- Based on what ${companyName} sells/does, create Google search queries a potential customer would use
- Mix of commercial intent ("best X UK", "buy X online") and informational ("X vs Y", "how to choose X")
- These will be used to test whether ${companyName} appears in Google results

## 3. Find Social Media Handles
- Fetch ${websiteUrl} and look in the footer/header for social media links
- Look for: Instagram, TikTok, Pinterest, Twitter/X, YouTube
- If not found on the site, search the web for "${companyName} instagram", "${companyName} tiktok" etc.
- Return the handle/username for each platform found (e.g. "@acmewellness" or just "acmewellness")

## 4. Find Trustpilot URL
- Search for "${companyName} trustpilot" or try fetching trustpilot.com/review/${new URL("https://" + websiteUrl.replace(/^https?:\/\//, "")).hostname}
- Return the full Trustpilot business page URL, or null if not found

## 5. Identify Pages to Screenshot (4-8 URLs)
We will capture screenshots of key pages to include as visuals in the report. Pick pages that would be most valuable to show:
- The target company's homepage (always include this, section: "executiveSummary")
- 1-2 key product/feature/pricing pages from the target site (section: "siteAudit")
- 1-2 top competitor homepages for visual comparison (section: "competitiveBenchmarking")
- The company's blog or content hub if it exists (section: "contentAudit")
- Any page you noticed during research that has notable UX/design issues worth highlighting

For each, provide the full URL, a short description of why it's worth capturing, and which report section it relates to.
Valid section values: "executiveSummary", "trafficAnalysis", "siteAudit", "competitiveBenchmarking", "contentAudit", "linkedinAudit", "socialSeo", "aiVisibility", "entitySeo", "redditAudit"

## Output Format
Return a single JSON object (no markdown fences, no explanation):

{
  "competitors": ["domain1.com", "domain2.com", ...],
  "searchQueries": ["best X UK", "buy X online", ...],
  "socialHandles": {
    "instagram": "handle_or_null",
    "tiktok": "handle_or_null",
    "pinterest": "handle_or_null",
    "twitter": "handle_or_null",
    "youtube": "handle_or_null"
  },
  "trustpilotUrl": "https://trustpilot.com/review/..." or null,
  "screenshotTargets": [
    { "url": "https://example.com", "context": "Company homepage", "section": "executiveSummary" },
    { "url": "https://competitor.com", "context": "Top competitor homepage", "section": "competitiveBenchmarking" }
  ]
}

CRITICAL: Your final response MUST be ONLY the raw JSON object. No explanation, no markdown.`;
}

export async function runDiscovery(
  websiteUrl: string,
  companyName: string,
  industry: string | null
): Promise<DiscoveryResult> {
  logger.info("Phase 1: Running discovery agent", { websiteUrl, companyName });
  const prompt = buildDiscoveryPrompt(websiteUrl, companyName, industry);

  const result = await runClaudeAgent(prompt, tmpdir(), {
    allowedTools: ["WebSearch", "WebFetch"],
    maxTurns: 40,
    model: MODEL_MAP.sonnet,
  });

  logger.info("Discovery agent complete", {
    costUsd: result.costUsd.toFixed(4),
    turns: result.turns,
    outputLen: result.output.length,
  });

  const json = extractJSON(result.output);
  const parsed = JSON.parse(json) as DiscoveryResult;

  // Validate minimum requirements
  if (!parsed.competitors?.length) {
    throw new Error("Discovery failed: no competitors found");
  }
  if (!parsed.searchQueries?.length) {
    throw new Error("Discovery failed: no search queries generated");
  }

  logger.info("Discovery results", {
    competitors: parsed.competitors.length,
    queries: parsed.searchQueries.length,
    socialHandles: Object.keys(parsed.socialHandles || {}).filter(
      (k) => parsed.socialHandles[k as keyof typeof parsed.socialHandles]
    ).length,
    hasTrustpilot: !!parsed.trustpilotUrl,
    screenshotTargets: parsed.screenshotTargets?.length ?? 0,
  });

  return parsed;
}
