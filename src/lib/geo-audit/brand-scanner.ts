const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

interface PlatformCheck {
  platform: string;
  weight: string;
  searchUrl: string;
  found: boolean;
  details: Record<string, unknown>;
}

export interface BrandScanResult {
  brandName: string;
  domain: string | null;
  platforms: {
    youtube: PlatformCheck;
    reddit: PlatformCheck;
    wikipedia: PlatformCheck & { hasWikipediaPage: boolean; hasWikidataEntry: boolean; wikidataId?: string };
    linkedin: PlatformCheck;
    others: { platform: string; searchUrl: string }[];
  };
  overallRecommendations: string[];
}

async function checkWikipedia(
  brandName: string
): Promise<{ hasPage: boolean; hasWikidata: boolean; wikidataId?: string; searchResults?: number }> {
  const result = { hasPage: false, hasWikidata: false, wikidataId: undefined as string | undefined, searchResults: 0 };

  try {
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(brandName)}&format=json`;
    const resp = await fetch(apiUrl, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(15000) });
    if (resp.ok) {
      const data = await resp.json();
      const searchResults = data?.query?.search || [];
      result.searchResults = searchResults.length;
      if (searchResults.length > 0) {
        const topTitle = (searchResults[0].title || "").toLowerCase();
        if (topTitle.includes(brandName.toLowerCase())) result.hasPage = true;
      }
    }
  } catch {
    // non-critical
  }

  try {
    const wdUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&format=json`;
    const resp = await fetch(wdUrl, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(15000) });
    if (resp.ok) {
      const data = await resp.json();
      const entities = data?.search || [];
      if (entities.length > 0) {
        result.hasWikidata = true;
        result.wikidataId = entities[0].id;
      }
    }
  } catch {
    // non-critical
  }

  return result;
}

export async function scanBrandPresence(brandName: string, domain: string | null = null): Promise<BrandScanResult> {
  const encoded = encodeURIComponent(brandName);
  const wiki = await checkWikipedia(brandName);

  return {
    brandName,
    domain,
    platforms: {
      youtube: {
        platform: "YouTube",
        weight: "25%",
        searchUrl: `https://www.youtube.com/results?search_query=${encoded}`,
        found: false, // would need YouTube API for real check
        details: { correlation: 0.737, note: "Highest correlation with AI citations" },
      },
      reddit: {
        platform: "Reddit",
        weight: "25%",
        searchUrl: `https://www.reddit.com/search/?q=${encoded}`,
        found: false,
        details: { correlation: "High" },
      },
      wikipedia: {
        platform: "Wikipedia",
        weight: "20%",
        searchUrl: `https://en.wikipedia.org/wiki/Special:Search?search=${encoded}`,
        found: wiki.hasPage || wiki.hasWikidata,
        hasWikipediaPage: wiki.hasPage,
        hasWikidataEntry: wiki.hasWikidata,
        wikidataId: wiki.wikidataId,
        details: { searchResults: wiki.searchResults },
      },
      linkedin: {
        platform: "LinkedIn",
        weight: "15%",
        searchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encoded}`,
        found: false,
        details: { correlation: "Moderate" },
      },
      others: [
        { platform: "Quora", searchUrl: `https://www.quora.com/search?q=${encoded}` },
        { platform: "Stack Overflow", searchUrl: `https://stackoverflow.com/search?q=${encoded}` },
        { platform: "GitHub", searchUrl: `https://github.com/search?q=${encoded}` },
        { platform: "Crunchbase", searchUrl: `https://www.crunchbase.com/textsearch?q=${encoded}` },
        { platform: "Product Hunt", searchUrl: `https://www.producthunt.com/search?q=${encoded}` },
        { platform: "G2", searchUrl: `https://www.g2.com/search?query=${encoded}` },
        { platform: "Trustpilot", searchUrl: `https://www.trustpilot.com/search?query=${encoded}` },
      ],
    },
    overallRecommendations: [
      "Priority 1: YouTube -- highest correlation (0.737) with AI citations. Create educational content.",
      "Priority 2: Reddit -- build authentic presence in industry subreddits.",
      "Priority 3: Wikipedia -- establish notability through press coverage.",
      "Priority 4: LinkedIn -- thought leadership from founders and employees.",
      "Priority 5: Review platforms -- G2, Trustpilot for social proof signals.",
      "Cross-platform: Ensure consistent branding and add sameAs schema links.",
    ],
  };
}
