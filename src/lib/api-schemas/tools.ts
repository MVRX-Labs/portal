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

// POST /api/tools/linkedin-audit
export const linkedinAuditBodySchema = z.object({
  contactId: z.string().min(1, "A contact is required"),
  accountId: z.string().nullable().optional(),
  model: z.string().optional(),
});

export type LinkedinAuditBody = z.infer<typeof linkedinAuditBodySchema>;

// POST /api/tools/linkedin-humanizer
export const linkedinHumanizerBodySchema = z.object({
  postContent: z.string().min(1, "postContent is required"),
  tone: z.string().optional(),
  writingExamples: z.string().optional(),
  model: z.string().optional(),
  accountId: z.string().optional(),
});

export type LinkedinHumanizerBody = z.infer<typeof linkedinHumanizerBodySchema>;

// POST /api/tools/linkedin-post-generator
export const linkedinPostGeneratorBodySchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  useLinkedinProfile: z.union([z.boolean(), z.string()]).optional(),
  sourceMaterial: z.string().min(1, "sourceMaterial is required"),
  voiceContext: z.string().optional(),
  model: z.string().optional(),
  accountId: z.string().optional(),
});

export type LinkedinPostGeneratorBody = z.infer<typeof linkedinPostGeneratorBodySchema>;

// POST /api/tools/gtm-strategy
export const gtmStrategyBodySchema = z.object({
  accountId: z.string().nullable().optional(),
  industry: z.string().min(1, "industry is required"),
  targetAudience: z.string().min(1, "targetAudience is required"),
  productDescription: z.string().min(1, "productDescription is required"),
  model: z.string().optional(),
});

export type GtmStrategyBody = z.infer<typeof gtmStrategyBodySchema>;

// POST /api/tools/sentiment-analysis
export const sentimentAnalysisBodySchema = z.object({
  productName: z.string().min(1, "productName is required"),
  accountId: z.string().nullable().optional(),
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
  accountId: z.string().nullable().optional(),
  model: z.string().optional(),
});

export type SeoAuditBody = z.infer<typeof seoAuditBodySchema>;

// POST /api/tools/outbound-sequence (uses createToolHandler)
export const outboundSequenceBodySchema = z
  .object({
    targetPersona: z.string().optional(),
    valueProp: z.string().optional(),
    steps: z.union([z.number(), z.string()]).optional(),
    channel: z.string().optional(),
    accountId: z.string().optional(),
  })
  .passthrough();

export type OutboundSequenceBody = z.infer<typeof outboundSequenceBodySchema>;

// POST /api/tools/growth-report
export const growthReportBodySchema = z.object({
  accountId: z.preprocess((v) => v ?? "", z.string().min(1, "Please select an account first")),
  model: z.string().optional(),
});

export type GrowthReportBody = z.infer<typeof growthReportBodySchema>;
