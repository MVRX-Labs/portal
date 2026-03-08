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
  type: "text" | "textarea" | "select" | "number" | "contact" | "checkbox";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
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
        placeholder: "Meeting notes, topic brief, news article, or brain dump of ideas...",
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
    id: "outbound-sequence",
    name: "Outbound Sequence Generator",
    description: "Generate multi-step outbound sequences for email and LinkedIn outreach.",
    href: "/tools/outbound-sequence",
    fields: [
      {
        name: "targetPersona",
        label: "Target Persona",
        type: "text",
        placeholder: "e.g. VP of Marketing at Series B startups",
        required: true,
      },
      {
        name: "valueProp",
        label: "Value Proposition",
        type: "textarea",
        placeholder: "What value do you offer this persona?",
        required: true,
      },
      {
        name: "steps",
        label: "Number of Steps",
        type: "number",
        placeholder: "5",
        required: true,
      },
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: true,
        options: [
          { label: "Email", value: "email" },
          { label: "LinkedIn", value: "linkedin" },
          { label: "Both", value: "both" },
        ],
      },
    ],
  },
];
