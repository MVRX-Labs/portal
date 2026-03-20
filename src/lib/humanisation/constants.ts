/**
 * Shared humanisation constants — single source of truth for AI-tell vocabulary,
 * corporate banned phrases, and writing-quality rules across all content generators.
 *
 * Deduplicated union of banned words/phrases from:
 *   - linkedin-post-generator.ts (59+ words + phrase bans)
 *   - linkedin-humanizer.ts (~30 words)
 *   - twitter-prompts.ts (human + viral presets, ~19 words each)
 */

// Re-export the corporate / outbound banned phrases so consumers can import from one place
export { BANNED_PHRASES as CORPORATE_BANNED_PHRASES } from "@/lib/outbound-sequence/constants";

/**
 * Words that are strong AI-writing tells. LLMs over-index on these relative to
 * how often humans actually use them. Every content generator should ban these.
 */
export const AI_TELL_VOCABULARY: readonly string[] = [
  // --- classic AI overuse words ---
  "delve",
  "tapestry",
  "moreover",
  "furthermore",
  "comprehensive",
  "robust",
  "utilize",
  "leverage",
  "nuanced",
  "crucial",
  "significant",
  "transformative",
  "testament",
  "authentic",
  "enhance",
  "ever-evolving",
  "game-changer",
  "landscape",
  "navigate",
  "realm",
  "embark",
  "foster",
  "facilitate",
  "streamline",
  "underscore",
  "commendable",
  "meticulous",
  "adept",
  // --- additional AI-tell adjectives/adverbs ---
  "pivotal",
  "vital",
  "vibrant",
  "intricate",
  "multifaceted",
  "profound",
  "compelling",
  "poignant",
  "visceral",
  "palpable",
  "enduring",
  "seemingly",
  "arguably",
  "notably",
  "importantly",
  "ultimately",
  "fundamentally",
  "inherently",
  "undeniably",
  // --- corporate / marketing AI-speak ---
  "cutting-edge",
  "revolutionary",
  "innovative solution",
  "disruptive",
  // --- filler transitions ---
  "in conclusion",
  "in summary",
  "additionally",
  "it's worth noting",
  "it's important to note",
  "in today's ever-evolving",
] as const;

/**
 * Full phrases that are AI writing tells — distinct from single words above.
 * These read as LLM-generated filler or false profundity.
 */
export const AI_TELL_PHRASES: readonly string[] = [
  "something shifted",
  "the weight of it",
  "a need he couldn't name",
  "a need she couldn't name",
  "for a moment",
  "and then, something changed",
] as const;
