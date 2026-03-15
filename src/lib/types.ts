export type { UserId, AccountId, ContactId, RunId, ObjectId } from "./ids";
export type { User } from "./api-schemas/admin";
export type { ToolRun } from "./api-schemas/history";

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  href: string;
  fields: ToolField[];
}

export interface ToolField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "contact" | "checkbox" | "prompt-select";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  /** For prompt-select: key into the presets object from twitter-prompts.ts */
  promptPresetsKey?: string;
}

export const TOOLS: ToolConfig[] = [
  {
    id: "engagement-bot",
    name: "Engagement Bot",
    description:
      "Monitor external LinkedIn profiles, surface new posts in Slack, and generate AI-powered comments for quick engagement.",
    href: "/linkedin-engagement",
    fields: [],
  },
  {
    id: "post-analytics",
    name: "Post Analytics",
    description:
      "Track your managed clients' LinkedIn post performance with automated weekly reports, engagement snapshots, and week-over-week growth metrics delivered to Slack.",
    href: "/analytics",
    fields: [],
  },
  {
    id: "linkedin-audit",
    name: "LinkedIn Profile Audit",
    description: "Analyze a LinkedIn profile and generate optimization recommendations.",
    href: "/tools/linkedin-audit",
    fields: [
      {
        name: "contactId",
        label: "Contact",
        type: "contact",
        required: true,
      },
    ],
  },
  {
    id: "linkedin-humanizer",
    name: "LinkedIn Post Humanizer",
    description: "Rewrite AI-generated LinkedIn posts to sound more authentic and human.",
    href: "/tools/linkedin-humanizer",
    fields: [
      {
        name: "postContent",
        label: "Post Content",
        type: "textarea",
        placeholder: "Paste your LinkedIn post here...",
        required: true,
      },
      {
        name: "tone",
        label: "Tone",
        type: "select",
        required: true,
        options: [
          { label: "Professional", value: "professional" },
          { label: "Casual", value: "casual" },
          { label: "Thought Leader", value: "thought-leader" },
          { label: "Storytelling", value: "storytelling" },
        ],
      },
      {
        name: "writingExamples",
        label: "Writing Style Examples (Optional)",
        type: "textarea",
        placeholder:
          "Paste 3-5 examples of your writing style (e.g., past LinkedIn posts, emails, blog excerpts). The AI will analyze and match your voice.",
      },
    ],
  },
  {
    id: "linkedin-to-twitter",
    name: "LinkedIn Post to Tweets",
    description: "Convert a LinkedIn post into a catchy Twitter thread or single tweet.",
    href: "/tools/linkedin-to-twitter",
    fields: [
      {
        name: "postContent",
        label: "LinkedIn Post",
        type: "textarea",
        placeholder: "Paste your LinkedIn post here...",
        required: true,
      },
      {
        name: "outputFormat",
        label: "Format",
        type: "select",
        options: [
          { label: "Thread", value: "thread" },
          { label: "Single Tweet", value: "single-tweet" },
        ],
      },
      {
        name: "callToAction",
        label: "Call to Action (optional)",
        type: "text",
        placeholder: "e.g. Full breakdown in the blog: https://...",
      },
      {
        name: "customPrompt",
        label: "Prompt",
        type: "prompt-select",
        promptPresetsKey: "twitter",
      },
    ],
  },
  {
    id: "gtm-strategy",
    name: "GTM Strategy Generator",
    description: "Generate a comprehensive go-to-market strategy for a company or product.",
    href: "/tools/gtm-strategy",
    fields: [
      {
        name: "industry",
        label: "Industry",
        type: "text",
        placeholder: "SaaS, FinTech, Healthcare...",
        required: true,
      },
      {
        name: "targetAudience",
        label: "Target Audience",
        type: "text",
        placeholder: "VP of Sales at mid-market B2B companies",
        required: true,
      },
      {
        name: "productDescription",
        label: "Product Description",
        type: "textarea",
        placeholder: "Describe the product or service...",
        required: true,
      },
    ],
  },
  {
    id: "sentiment-analysis",
    name: "Product Sentiment Analysis",
    description: "Analyze product sentiment across reviews, social media, and forums.",
    href: "/tools/sentiment-analysis",
    fields: [
      {
        name: "productName",
        label: "Product Name",
        type: "text",
        placeholder: "e.g. Notion, Slack, HubSpot",
        required: true,
      },
      {
        name: "sources",
        label: "Source Type",
        type: "select",
        required: true,
        options: [
          { label: "All Sources", value: "all" },
          { label: "Reddit + Forums", value: "reddit" },
          { label: "Review Sites (G2, Capterra)", value: "reviews" },
          { label: "Google Reviews", value: "google" },
          { label: "General Web", value: "web" },
        ],
      },
      {
        name: "urls",
        label: "Additional URLs (Optional)",
        type: "textarea",
        placeholder: "One URL per line — specific review pages, forum threads, etc.",
      },
      {
        name: "keywords",
        label: "Keywords to Track (Optional)",
        type: "text",
        placeholder: "Comma-separated: pricing, support, onboarding",
      },
    ],
  },
  {
    id: "linkedin-post-generator",
    name: "LinkedIn Post Generator",
    description:
      "Generate LinkedIn posts with 3 hook variations, a LinkedIn-optimised body, and a humanised body from source material and voice context.",
    href: "/tools/linkedin-post-generator",
    fields: [
      {
        name: "contactId",
        label: "Who Is Posting",
        type: "contact",
        required: true,
      },
      {
        name: "useLinkedinProfile",
        label: "Use contact's LinkedIn profile for voice analysis",
        type: "checkbox",
      },
      {
        name: "sourceMaterial",
        label: "Source Material",
        type: "textarea",
        placeholder: "Blog link, meeting notes, topic brief, news article, or brain dump of ideas. A link is optional.",
        required: true,
      },
      {
        name: "voiceContext",
        label: "Voice Context (Optional)",
        type: "textarea",
        placeholder:
          "Style guide, past LinkedIn posts, or a description of the tone they want. The more examples, the better the voice match.",
      },
    ],
  },
  {
    id: "seo-audit",
    name: "Website SEO Audit",
    description:
      "Audit a website for SEO, performance, security, accessibility, and technical issues across 251 rules using SEOmator.",
    href: "/tools/seo-audit",
    fields: [
      {
        name: "websiteUrl",
        label: "Website URL",
        type: "text",
        placeholder: "https://example.com",
        required: true,
      },
      {
        name: "crawlMode",
        label: "Crawl Mode",
        type: "select",
        required: true,
        options: [
          { label: "Single Page", value: "single" },
          { label: "Multi-page Crawl (up to 20 pages)", value: "crawl-20" },
          { label: "Deep Crawl (up to 50 pages)", value: "crawl-50" },
          { label: "Full Crawl (up to 100 pages)", value: "crawl-100" },
        ],
      },
      {
        name: "categories",
        label: "Focus Categories (Optional)",
        type: "text",
        placeholder: "core,performance,security,links,images — leave empty for all",
      },
      {
        name: "includeCwv",
        label: "Include Core Web Vitals & JS rendering analysis (slower)",
        type: "checkbox",
      },
    ],
  },
  {
    id: "growth-report",
    name: "SEO & Growth Report",
    description:
      "Generate a full SEO & growth strategy report with traffic analysis, competitive benchmarking, LinkedIn audit, AI visibility, and pricing — modelled on our golden client reports.",
    href: "/tools/growth-report",
    fields: [],
  },
  {
    id: "outbound-sequence",
    name: "LinkedIn Outbound Sequences",
    description:
      "Generate HeyReach-ready LinkedIn outbound sequences — 3 structures × 2 A/B variants with human-sounding copy.",
    href: "/tools/outbound-sequence",
    fields: [
      {
        name: "senderContactId",
        label: "Sender",
        type: "contact",
        placeholder: "Who is sending these messages?",
        required: false,
      },
      {
        name: "targetIcp",
        label: "Target ICP",
        type: "textarea",
        placeholder:
          "e.g. VP of Marketing at Series B SaaS companies (50-200 employees) who are scaling content but struggling with organic growth",
        required: true,
      },
      {
        name: "valueProp",
        label: "Value Proposition",
        type: "textarea",
        placeholder:
          "What specific value does the sender offer this ICP? Be concrete — what outcomes, what proof points?",
        required: true,
      },
      {
        name: "toneNotes",
        label: "Tone / Style Notes",
        type: "textarea",
        placeholder: "Optional: any specific tone guidance, phrases to include, or style preferences for the sender",
        required: false,
      },
    ],
  },
  {
    id: "ingest-skill",
    name: "Ingest Skill",
    description:
      "Import a third-party Claude Skill and auto-implement it as a native portal tool. Creates a PR for review.",
    href: "/tools/ingest-skill",
    fields: [
      {
        name: "skillUrl",
        label: "Skill URL",
        type: "text",
        placeholder: "https://skills.sh/...",
      },
      {
        name: "skillMd",
        label: "Or paste SKILL.md content",
        type: "textarea",
        placeholder: "---\nname: my-skill\ndescription: ...\n---\n\nInstructions...",
      },
      {
        name: "slug",
        label: "Tool slug (optional)",
        type: "text",
        placeholder: "seo-audit",
      },
      {
        name: "notes",
        label: "Notes for implementation (optional)",
        type: "textarea",
        placeholder: "Any additional context or instructions for how to implement this skill...",
      },
    ],
  },
];
