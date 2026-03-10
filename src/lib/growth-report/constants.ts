import type { GrowthReportContent } from "./schema";

export const MVRX_CASE_STUDIES: GrowthReportContent["caseStudies"] = [
  {
    title: "ElevenLabs: #1 for Core AI Voice Keywords",
    subtitle:
      "ElevenLabs is the world's leading AI voice platform. MVRX Labs was engaged to drive organic search growth across their highest-value keywords.",
    details: [
      { label: "Client", value: "ElevenLabs (Series B, $1B+ valuation)" },
      { label: "Objective", value: "Rank #1 for 'text to speech', 'voice cloning', 'AI voice generator' and others" },
      {
        label: "Process",
        value:
          "Built and shipped best-in-class, SEO-optimised site and landing pages. Monitored rankings and iterated on content strategy.",
      },
      { label: "Impact", value: "100x SEO traffic growth. 20% of total traffic from non-branded organic." },
    ],
  },
  {
    title: "Recraft: Page 1 for AI Image Generation Keywords",
    subtitle:
      "Recraft is an AI design platform. MVRX Labs was engaged to build organic search visibility for programmatic use-case pages.",
    details: [
      { label: "Client", value: "Recraft (AI image generation platform)" },
      {
        label: "Objective",
        value: "Page 1 for 'AI icon generator', 'AI wallpaper generator' and long-tail use-case keywords",
      },
      {
        label: "Process",
        value: "Best-in-class SEO foundations. Programmatically generated targeted use-case pages with unique content.",
      },
      { label: "Impact", value: "10x non-branded organic traffic. 15% of total traffic from organic search." },
    ],
  },
  {
    title: "ElevenLabs: Paid Search at Scale",
    subtitle: "MVRX Labs managed high-spend paid search campaigns to outpace competitors on core keywords.",
    details: [
      { label: "Client", value: "ElevenLabs" },
      { label: "Objective", value: "Outpace competitors on core keywords. Capture high-value US/EU customers fast." },
      {
        label: "Process",
        value:
          "Added checkout tracking via Google Tag Manager. Privacy-safe user attribution. Iterative bid strategy and ad copy testing.",
      },
      { label: "Impact", value: "SEM drove 5% of total traffic at peak. $100K/week ad spend managed." },
    ],
  },
];

export const STANDARD_PRICING = {
  components: {
    techSeo: {
      component: "Technical SEO",
      detail: "Roadmap, specs, schema templates, ongoing audits",
      monthly: "\u00a31,500",
    },
    linkedin: {
      component: "LinkedIn (founders + company)",
      detail: "8-10 posts/week total, ghostwriting, scheduling",
      monthly: "\u00a32,500",
    },
    blogContent: {
      component: "SEO blog content",
      detail: "2-4 articles/month (3,000+ words each)",
      monthly: "\u00a32,000",
    },
    linkBuilding: {
      component: "Link building programme",
      detail: "Stockist outreach, PR, expert content, resource pages",
      monthly: "\u00a31,500",
    },
    socialReddit: {
      component: "Social SEO + Reddit",
      detail: "TikTok scripts, IG optimisation, Reddit community",
      monthly: "\u00a31,000",
    },
    reporting: {
      component: "Reporting + AI visibility",
      detail: "Monthly reports, SoM tracking, competitor benchmarks",
      monthly: "\u00a3500",
    },
    monthlyAudit: {
      component: "Monthly SEO audit (50-page crawl)",
      detail: "Automated crawl with analysis and recommendations",
      monthly: "\u00a3750",
    },
    competitorBench: {
      component: "Monthly competitor benchmark",
      detail: "SimilarWeb + DR tracking for competitors",
      monthly: "\u00a3500",
    },
    advisory: {
      component: "Strategic advisory (4 hrs/month)",
      detail: "Bi-weekly calls, async Slack/email support",
      monthly: "\u00a31,000",
    },
    quarterlyDeep: {
      component: "Quarterly deep-dive report",
      detail: "Full refresh of this report with updated data",
      monthly: "\u00a3750",
    },
    linkedinCeo: {
      component: "LinkedIn content (CEO/Founder)",
      detail: "3-4 posts/week, ghostwriting, scheduling",
      monthly: "\u00a31,200",
    },
    linkedinCofounder: {
      component: "LinkedIn content (Co-founder)",
      detail: "2 posts/week, ghostwriting, scheduling",
      monthly: "\u00a3800",
    },
    linkedinCompany: {
      component: "Company page content",
      detail: "3-4 posts/week, rebalanced content mix",
      monthly: "\u00a3800",
    },
    linkedinReport: {
      component: "Monthly LinkedIn analytics report",
      detail: "Engagement tracking, content performance, growth metrics",
      monthly: "\u00a3200",
    },
    reportDirection: {
      component: "Reporting + strategic direction",
      detail: "Monthly reports, technical SEO guidance, competitor intel",
      monthly: "\u00a3750",
    },
  },
  exclusions: [
    "Engineering implementation: On-site code changes require client's engineering team.",
    "Paid advertising: Google Ads, Meta Ads, TikTok Ads are out of scope. This engagement is purely organic growth.",
    "Design/creative production: Video filming, graphic design, and photography. MVRX provides scripts and briefs; production is client's responsibility.",
    "Google Search Console: Requires client to grant read-only access. MVRX will analyse the data once access is provided.",
  ],
} as const;

/** Known AI bots to check in robots.txt */
export const AI_BOTS = [
  { name: "OAI-SearchBot", impact: "ChatGPT real-time search" },
  { name: "GPTBot", impact: "ChatGPT training data" },
  { name: "ChatGPT-User", impact: "ChatGPT browsing" },
  { name: "PerplexityBot", impact: "Perplexity search" },
  { name: "ClaudeBot", impact: "Claude training data" },
  { name: "anthropic-ai", impact: "Anthropic crawling" },
  { name: "CCBot", impact: "Common Crawl / AI training" },
  { name: "Google-Extended", impact: "Gemini training data" },
  { name: "Bytespider", impact: "TikTok / ByteDance AI" },
] as const;
