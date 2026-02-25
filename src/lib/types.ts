export interface User {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface ToolRun {
  id: string;
  tool: string;
  status: "pending" | "running" | "completed" | "failed";
  inputs: Record<string, unknown>;
  outputUrl: string | null;
  error: string | null;
  userId: string;
  userName?: string;
  createdAt: string;
  updatedAt: string;
}

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
  type: "text" | "textarea" | "select" | "number";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

export const TOOLS: ToolConfig[] = [
  {
    id: "linkedin-audit",
    name: "LinkedIn Profile Audit",
    description:
      "Analyze a LinkedIn profile and generate optimization recommendations.",
    href: "/tools/linkedin-audit",
    fields: [
      {
        name: "linkedinUrl",
        label: "LinkedIn Profile URL",
        type: "text",
        placeholder: "https://linkedin.com/in/username",
        required: true,
      },
      {
        name: "companyName",
        label: "Client / Company Name",
        type: "text",
        placeholder: "Acme Inc.",
        required: true,
      },
    ],
  },
  {
    id: "linkedin-humanizer",
    name: "LinkedIn Post Humanizer",
    description:
      "Rewrite AI-generated LinkedIn posts to sound more authentic and human.",
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
    ],
  },
  {
    id: "gtm-strategy",
    name: "GTM Strategy Generator",
    description:
      "Generate a comprehensive go-to-market strategy for a company or product.",
    href: "/tools/gtm-strategy",
    fields: [
      {
        name: "companyName",
        label: "Company Name",
        type: "text",
        placeholder: "Acme Inc.",
        required: true,
      },
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
    description:
      "Analyze product sentiment across reviews, social media, and forums.",
    href: "/tools/sentiment-analysis",
    fields: [
      {
        name: "productName",
        label: "Product Name",
        type: "text",
        placeholder: "Product name",
        required: true,
      },
      {
        name: "urls",
        label: "URLs to Analyze",
        type: "textarea",
        placeholder: "One URL per line",
        required: true,
      },
      {
        name: "keywords",
        label: "Keywords",
        type: "text",
        placeholder: "Comma-separated keywords",
      },
    ],
  },
  {
    id: "outbound-sequence",
    name: "Outbound Sequence Generator",
    description:
      "Generate multi-step outbound sequences for email and LinkedIn outreach.",
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
