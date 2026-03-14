import { z } from "zod";

export const POST_CATEGORIES = [
  "thought_leadership",
  "domain_knowledge",
  "third_party_validation",
  "case_study",
  "storytelling",
  "other",
] as const;

export const POST_CATEGORY_LABELS: Record<(typeof POST_CATEGORIES)[number], string> = {
  thought_leadership: "Thought Leadership",
  domain_knowledge: "Domain Knowledge",
  third_party_validation: "3rd Party Validation",
  case_study: "Case Study",
  storytelling: "Story-telling",
  other: "Other",
};
// PATCH /api/linkedin-posts/[postId]
export const patchLinkedinPostBodySchema = z.object({
  category: z.enum(POST_CATEGORIES).nullable(),
});

export type PatchLinkedinPostBody = z.infer<typeof patchLinkedinPostBodySchema>;

export const patchLinkedinPostResponseSchema = z.object({
  ok: z.literal(true),
  category: z.string().nullable(),
});

export type PatchLinkedinPostResponse = z.infer<typeof patchLinkedinPostResponseSchema>;

// POST /api/categorise-posts
export const categorisePostsResponseSchema = z.object({
  triggered: z.literal(true),
  runId: z.string(),
});

export type CategorisePostsResponse = z.infer<typeof categorisePostsResponseSchema>;
