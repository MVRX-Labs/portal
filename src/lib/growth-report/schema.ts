export type MetricStatus = "good" | "warning" | "bad" | "info";

export interface MetricValue {
  value: string;
  status: MetricStatus;
}

export interface GrowthReportContent {
  companyName: string;
  websiteUrl: string;
  preparedDate: string;
  preparedFor: string;
  dataSources: string[];

  keyMetrics: {
    monthlyVisits: MetricValue;
    countryRank: MetricValue;
    domainRating: MetricValue;
    onSiteScore: MetricValue;
    searchTraffic: MetricValue;
    backlinks: MetricValue;
    igFollowers: MetricValue;
    tiktokFollowers: MetricValue;
    linkedinFollowers: MetricValue;
  };

  executiveSummary: { overview: string; keyConclusion: string };

  trafficAnalysis?: {
    dataSource: string;
    metrics: Array<{ metric: string; value: string }>;
    trafficSources: { search: string; direct: string; referral: string; social: string };
    findings: string[];
  };

  domainAuthority?: {
    dataSource: string;
    metrics: Array<{ metric: string; value: string }>;
    findings: string[];
    linkOpportunities: string[];
  };

  siteAudit?: {
    dataSource: string;
    summaryStats: { pagesAudited: number; avgScore: number; errors404: number };
    categoryScores: Record<string, number>;
    pageBreakdown: Array<{
      page: string;
      score: number;
      meta: number;
      headings: number;
      content: number;
      technical: number;
      schema: number;
      words: string;
      type: string;
    }>;
    criticalIssues: string[];
  };

  competitiveBenchmarking?: {
    dataSources: string;
    competitors: Array<{
      site: string;
      visits: string;
      countryRank: string;
      dr: string;
      backlinks: string;
      refDomains: string;
      search: string;
      bounce: string;
      pagesPerVisit: string;
    }>;
    findings: string[];
  };

  contentAudit?: {
    dataSource: string;
    articles: Array<{
      article: string;
      score: string;
      metaDesc: string;
      h1: string;
      schema: string;
      words: string;
      status: string;
    }>;
    findings: string[];
  };

  linkedinAudit?: {
    dataSources: string;
    profiles: Array<{ label: string; name: string; followers: string }>;
    engagementStats: Array<{ label: string; value: string }>;
    companyThemes: Array<{
      theme: string;
      count: number;
      avgLikes: string;
      avgComments: string;
      avgReposts: string;
      assessment: string;
    }>;
    founderPosts?: Array<{
      post: string;
      likes: number;
      comments: number;
      engRate: string;
      hook: string;
      cta: string;
      story: string;
      score: number;
    }>;
    findings: string[];
  };

  socialSeo?: {
    dataSources: string;
    coreProblem: string;
    platforms: Array<{ platform: string; followers: string; content: string; trafficImpact: string }>;
    findings: string[];
  };

  aiVisibility?: {
    dataSources: string;
    botStatus: Array<{ bot: string; status: string; impact: string; action: string }>;
    shareOfModel: Array<{ query: string; result: string; whoRanks: string }>;
    findings: string[];
  };

  entitySeo?: {
    dataSources: string;
    platforms: Array<{ platform: string; status: string; data: string; action: string }>;
    findings: string[];
  };

  linkedinStrategy?: {
    people: Array<{
      name: string;
      role: string;
      frequency: string;
      themes: Array<{ theme: string; pct: string; description: string }>;
    }>;
    companyRebalance?: Array<{ theme: string; current: string; target: string; change: string }>;
  };

  masterStrategy?: {
    initiatives: Array<{
      num: number;
      initiative: string;
      impact: string;
      effort: string;
      timeline: string;
      owner: string;
      category: string;
      metric: string;
      note: string;
    }>;
  };

  measurementFramework?: {
    targets: { label: string; value: string; status: MetricStatus }[];
    cadence: string[];
  };

  redditAudit?: {
    dataSource: string;
    overview: string;
    summaryStats: { brandMentions: string; sentiment: string; topSubreddits: string };
    mentions: Array<{
      post: string;
      subreddit: string;
      score: string;
      comments: string;
      type: string;
      detail: string;
    }>;
    findings: string[];
    recommendations: string[];
  };

  screenshots?: Array<{
    url: string;
    section: string;
    caption: string;
    filename: string;
    width: number;
    height: number;
  }>;

  caseStudies: Array<{
    title: string;
    subtitle: string;
    details: Array<{ label: string; value: string }>;
    screenshotCaption?: string;
  }>;

  statementOfWork: {
    scopeDescription: string;
    workstreams: string[];
    deliverables: Array<{ deliverable: string; frequency: string; format: string }>;
    timeline: Array<{ phase: string; timing: string; milestones: string }>;
  };

  pricing: {
    introduction: string;
    options: Array<{
      name: string;
      description: string;
      components: Array<{ component: string; detail: string; monthly: string }>;
      total: string;
      note: string;
    }>;
    exclusions: string[];
  };
}
