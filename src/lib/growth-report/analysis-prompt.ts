export function buildAnalysisPrompt(websiteUrl: string, companyName: string, date: string): string {
  return `\
You are a senior SEO analyst and growth strategist at MVRX Labs. You are producing a comprehensive SEO & Growth Strategy Report for "${companyName}" (${websiteUrl}).

All scraped data has been saved as JSON files in this directory. Read ALL files to understand the full picture before generating output.

## Files Available
- research.json — Discovery phase: competitors, search queries, social handles
- similarweb.json — Traffic data for target + competitors
- ahrefs.json — Domain authority/backlinks for target + competitors
- seo-audit.json — On-site SEO audit (15-20 pages)
- linkedin-company.json — Company LinkedIn page data + posts
- linkedin-*.json — Individual people's LinkedIn profiles + posts
- instagram.json — Instagram profile data
- tiktok.json — TikTok profile data
- ai-visibility.json — robots.txt analysis, llms.txt check, bot statuses
- serp-results.json — Google SERP results for category queries
- trustpilot.json — Trustpilot reviews/ratings
- reddit.json — Reddit brand mentions
- discovery.json — Company info, competitors, social handles (from web research)
- failures.json — List of scrapers that failed (handle gracefully)

Some files may be missing if scrapers failed. Work with what's available and note data gaps.

## Output Schema
Produce a SINGLE JSON object matching this TypeScript interface exactly:

interface GrowthReportContent {
  companyName: string;
  websiteUrl: string;
  preparedDate: string; // "${date}"
  preparedFor: string; // "${companyName}"
  dataSources: string[]; // List actual sources used (e.g. "SimilarWeb", "Ahrefs", etc.)
  keyMetrics: {
    monthlyVisits: string; countryRank: string; domainRating: string;
    onSiteScore: string; searchTraffic: string; backlinks: string;
    igFollowers: string; tiktokFollowers: string; linkedinFollowers: string;
  };
  executiveSummary: { overview: string; keyConclusion: string; };
  trafficAnalysis: {
    dataSource: string;
    metrics: Array<{ metric: string; value: string; }>;
    trafficSources: { search: string; direct: string; referral: string; social: string; };
    findings: string[]; // 4-6 bullet points with specific numbers
  };
  domainAuthority: {
    dataSource: string;
    metrics: Array<{ metric: string; value: string; }>;
    findings: string[]; // 3-5 bullets
    linkOpportunities: string[]; // 3-5 actionable opportunities
  };
  siteAudit: {
    dataSource: string;
    summaryStats: { pagesAudited: number; avgScore: number; errors404: number; };
    categoryScores: Record<string, number>; // 6 categories, scores 0-100
    pageBreakdown: Array<{
      page: string; score: number; meta: number; headings: number;
      content: number; technical: number; schema: number; words: string; type: string;
    }>;
    criticalIssues: string[]; // 3-7 issues with specifics
  };
  competitiveBenchmarking: {
    dataSources: string;
    competitors: Array<{
      site: string; visits: string; countryRank: string; dr: string;
      backlinks: string; refDomains: string; search: string; bounce: string; pagesPerVisit: string;
    }>; // Include ${companyName} in the table
    findings: string[]; // 4-6 comparative insights
  };
  contentAudit: {
    dataSource: string;
    articles: Array<{
      article: string; score: string; metaDesc: string; h1: string;
      schema: string; words: string; status: string;
    }>;
    findings: string[];
  };
  linkedinAudit: {
    dataSources: string;
    profiles: Array<{ label: string; name: string; followers: string; }>;
    engagementStats: Array<{ label: string; value: string; }>;
    companyThemes: Array<{
      theme: string; count: number; avgLikes: string; avgComments: string;
      avgReposts: string; assessment: string;
    }>;
    founderPosts?: Array<{
      post: string; likes: number; comments: number; engRate: string;
      hook: string; cta: string; story: string; score: number;
    }>;
    findings: string[];
  };
  socialSeo: {
    dataSources: string;
    coreProblem: string; // The key insight about social-to-site conversion
    platforms: Array<{ platform: string; followers: string; content: string; trafficImpact: string; }>;
    findings: string[];
  };
  aiVisibility: {
    dataSources: string;
    botStatus: Array<{ bot: string; status: string; impact: string; action: string; }>;
    shareOfModel: Array<{ query: string; result: string; whoRanks: string; }>;
    findings: string[];
  };
  entitySeo: {
    dataSources: string;
    platforms: Array<{ platform: string; status: string; data: string; action: string; }>;
    findings: string[];
  };
  linkedinStrategy: {
    people: Array<{
      name: string; role: string; frequency: string;
      themes: Array<{ theme: string; pct: string; description: string; }>;
    }>;
    companyRebalance?: Array<{ theme: string; current: string; target: string; change: string; }>;
  };
  masterStrategy: {
    initiatives: Array<{
      num: number; initiative: string; impact: string; effort: string;
      timeline: string; owner: string; category: string; metric: string; note: string;
    }>; // 15-30 initiatives, stack-ranked by impact-to-effort
  };
  measurementFramework: {
    targets: Array<{ label: string; value: string; }>; // 6 targets with current→target format
    cadence: string[]; // Weekly, Monthly, Quarterly, Ongoing
  };
  redditAudit?: { // Only include if reddit data available
    dataSource: string; overview: string;
    summaryStats: { brandMentions: string; sentiment: string; topSubreddits: string; };
    mentions: Array<{
      post: string; subreddit: string; score: string; comments: string; type: string; detail: string;
    }>;
    findings: string[];
    recommendations: string[];
  };
  // SKIP: caseStudies, statementOfWork, pricing — these are handled separately
}

## Analysis Guidelines

1. **Be data-driven.** Every finding must reference specific numbers from the scraped data. Never make up statistics.
2. **Be specific.** Instead of "improve headings", say "Fix H1 structure on 8 pages where third-party widget injects rogue H1 tags."
3. **Cross-reference sections.** Traffic data should inform competitive insights. LinkedIn data should inform the strategy.
4. **LinkedIn post analysis:** Classify each company post into themes (Milestone, Product, Event, Hiring, Philosophy, etc.). Calculate average engagement per theme. Score founder posts on Hook/CTA/Story (x/10) and overall (0-100).
5. **LinkedIn strategy:** Based on post analysis, create per-person content strategies with 3-4 themes and percentages. Tailor to each person's background and strengths.
6. **Master strategy:** Create 15-30 initiatives across Tech SEO, AI Visibility, Social SEO, LinkedIn, Content, Authority, Entity SEO, Distribution. Rank by impact-to-effort ratio. Use specific metrics from the data.
7. **Measurement targets:** Set realistic 12-month targets based on current baselines from the data.
8. **Social SEO core problem:** Calculate the follower-to-traffic conversion rate and frame it as the key missed opportunity.
9. **AI visibility:** Map each bot's status from the robots.txt analysis. For SERP queries, check if the target site appears in results.
10. **Entity SEO:** Cross-reference Crunchbase vs Tracxn data — inconsistencies are findings, not errors.
11. **If data is missing** for a section (scraper failed), include the section with a note that data was unavailable.
12. **keyMetrics:** Use real numbers from the data. Format large numbers with K/M suffixes.

CRITICAL: Your final text response MUST contain the raw JSON object directly.
Do NOT wrap it in markdown code fences. Do NOT use any tool to save the JSON.
Output ONLY the JSON object, nothing else.`;
}
