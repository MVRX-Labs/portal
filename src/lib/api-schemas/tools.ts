import { z } from "zod";

// Shared tool trigger response (all tool routes use this)
export const toolTriggerResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  triggerRunId: z.string().optional(),
  publicAccessToken: z.string().optional(),
  message: z.string().optional(),
});

export type ToolTriggerResponse = z.infer<typeof toolTriggerResponseSchema>;

export const toolTriggerErrorResponseSchema = z.object({
  id: z.string().optional(),
  error: z.string(),
});

export type ToolTriggerErrorResponse = z.infer<typeof toolTriggerErrorResponseSchema>;

const requiredAccountId = z.preprocess((v) => v ?? "", z.string().min(1, "Please select an account first"));

// POST /api/tools/linkedin-audit
export const linkedinAuditBodySchema = z.object({
  contactId: z.string().min(1, "A contact is required"),
  accountId: requiredAccountId,
  model: z.string().optional(),
});

export type LinkedinAuditBody = z.infer<typeof linkedinAuditBodySchema>;

// POST /api/tools/twitter-audit
export const twitterAuditBodySchema = z.object({
  contactId: z.string().min(1, "A contact is required"),
  accountId: requiredAccountId,
  model: z.string().optional(),
});

export type TwitterAuditBody = z.infer<typeof twitterAuditBodySchema>;

// POST /api/tools/linkedin-to-twitter
export const linkedinToTwitterBodySchema = z.object({
  postContent: z.string().min(1, "postContent is required"),
  promptStyle: z.enum(["default", "human", "viral"]).optional(),
  customPrompt: z.string().optional(),
  outputFormat: z.enum(["thread", "single-tweet"]).optional(),
  callToAction: z.string().optional(),
  model: z.string().optional(),
  accountId: requiredAccountId,
});

export type LinkedinToTwitterBody = z.infer<typeof linkedinToTwitterBodySchema>;

// POST /api/tools/linkedin-post-generator
export const linkedinPostGeneratorBodySchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  useLinkedinProfile: z.union([z.boolean(), z.string()]).optional(),
  sourceMaterial: z.string().min(1, "sourceMaterial is required"),
  voiceContext: z.string().optional(),
  promptStyle: z.enum(["default", "narrative", "analytical"]).optional(),
  customPrompt: z.string().optional(),
  model: z.string().optional(),
  accountId: requiredAccountId,
});

export type LinkedinPostGeneratorBody = z.infer<typeof linkedinPostGeneratorBodySchema>;

// POST /api/tools/twitter-post-generator
export const twitterPostGeneratorBodySchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  sourceMaterial: z.string().min(1, "sourceMaterial is required"),
  voiceContext: z.string().optional(),
  promptStyle: z.enum(["default", "thread", "analytical"]).optional(),
  customPrompt: z.string().optional(),
  model: z.string().optional(),
  accountId: requiredAccountId,
});

export type TwitterPostGeneratorBody = z.infer<typeof twitterPostGeneratorBodySchema>;

// POST /api/tools/twitter-to-linkedin
export const twitterToLinkedinBodySchema = z.object({
  postContent: z.string().min(1, "postContent is required"),
  outputFormat: z.enum(["full", "short"]).optional(),
  model: z.string().optional(),
  accountId: requiredAccountId,
});

export type TwitterToLinkedinBody = z.infer<typeof twitterToLinkedinBodySchema>;

// POST /api/tools/gtm-strategy
export const gtmStrategyBodySchema = z.object({
  accountId: requiredAccountId,
  industry: z.string().min(1, "industry is required"),
  targetAudience: z.string().min(1, "targetAudience is required"),
  productDescription: z.string().min(1, "productDescription is required"),
  model: z.string().optional(),
});

export type GtmStrategyBody = z.infer<typeof gtmStrategyBodySchema>;

// POST /api/tools/sentiment-analysis
export const sentimentAnalysisBodySchema = z.object({
  productName: z.string().min(1, "productName is required"),
  accountId: requiredAccountId,
  sources: z.string().optional(),
  urls: z.string().optional(),
  keywords: z.string().optional(),
  model: z.string().optional(),
});

export type SentimentAnalysisBody = z.infer<typeof sentimentAnalysisBodySchema>;

// POST /api/tools/suggestion
export const suggestionBodySchema = z.object({
  toolId: z.string().min(1, "toolId is required"),
  description: z.string().min(1, "description is required"),
});

export type SuggestionBody = z.infer<typeof suggestionBodySchema>;

// POST /api/tools/seo-audit
export const seoAuditBodySchema = z.object({
  websiteUrl: z.string().min(1, "websiteUrl is required"),
  crawlMode: z.enum(["single", "crawl-20", "crawl-50", "crawl-100"]),
  categories: z.string().optional(),
  includeCwv: z.union([z.boolean(), z.string()]).optional(),
  accountId: requiredAccountId,
  model: z.string().optional(),
});

export type SeoAuditBody = z.infer<typeof seoAuditBodySchema>;

// POST /api/tools/outbound-sequence
export const outboundSequenceBodySchema = z.object({
  accountId: requiredAccountId,
  senderContactId: z.string().optional(),
  targetIcp: z.string().min(1, "Target ICP is required"),
  valueProp: z.string().min(1, "Value proposition is required"),
  toneNotes: z.string().optional(),
  audienceSegments: z.string().optional(),
  leadListDescription: z.string().optional(),
  senderAccountCount: z.coerce.number().int().min(1).optional(),
  model: z.string().optional(),
});

export type OutboundSequenceBody = z.infer<typeof outboundSequenceBodySchema>;

// POST /api/tools/growth-report
export const growthReportBodySchema = z.object({
  accountId: requiredAccountId,
  model: z.string().optional(),
});

export type GrowthReportBody = z.infer<typeof growthReportBodySchema>;

// POST /api/tools/geo-audit
export const geoAuditBodySchema = z.object({
  accountId: requiredAccountId,
  websiteUrl: z.string().min(1, "Website URL is required"),
  brandName: z.string().optional(),
  model: z.string().optional(),
});

export type GeoAuditBody = z.infer<typeof geoAuditBodySchema>;
