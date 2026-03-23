/**
 * Composable prompt text blocks for humanisation.
 *
 * Each function returns a plain string that can be injected into any LLM prompt.
 * Short-form generators (comments, engagement bot) use `buildShortFormHumanisationBlock()`.
 * Long-form generators (post generator, humanizer) pick individual blocks for finer control.
 */

import { AI_TELL_VOCABULARY, AI_TELL_PHRASES, CORPORATE_BANNED_PHRASES } from "./constants";

// ---------------------------------------------------------------------------
// Individual blocks
// ---------------------------------------------------------------------------

/** Banned AI-tell vocabulary section. */
export function buildAntiAIVocabBlock(): string {
  const words = AI_TELL_VOCABULARY.join(", ");
  const phrases = AI_TELL_PHRASES.map((p) => `"${p}"`).join(", ");

  return `BANNED VOCABULARY (using any of these is a hard failure):
Never use: ${words}.

Also banned phrases: ${phrases}.`;
}

/** Em-dash and formatting rules. */
export function buildPunctuationRulesBlock(): string {
  return `PUNCTUATION & FORMATTING RULES:
- NEVER use em dashes (\u2014). Use commas, periods, colons, or parentheses instead. Em dashes are the single most recognised AI writing tell.
- Do NOT scatter emojis. If emojis are used at all, limit to 1-2 total where they feel earned, not decorative.`;
}

/** Contractions, sentence variance, and reading level. */
export function buildNaturalnessBlock(): string {
  return `LANGUAGE NATURALNESS RULES:
- USE contractions naturally (it's, don't, can't, I've, we're, you'll). Fully expanded forms sound robotic.
- Vary sentence length. Mix short punchy fragments with longer flowing ones. This "burstiness" is the biggest differentiator between human and AI writing.
- Write at roughly a 6th-8th grade reading level. Short words beat long words. "Use" beats "utilize." "Help" beats "facilitate."
- Sound like a real person, not a PR team or marketing department.`;
}

/** Corporate banned phrases (outbound-style). */
export function buildBannedPhrasesBlock(): string {
  const list = CORPORATE_BANNED_PHRASES.map((p) => `- "${p}"`).join("\n");
  return `BANNED CORPORATE PHRASES (if any appear, the output is rejected):
${list}`;
}

/**
 * Self-edit humanisation checklist — adapted from the post generator's Step 5.
 * Best suited for long-form content (posts, articles). Overkill for comments.
 */
export function buildHumanisationPassBlock(): string {
  return `HUMANISATION PASS (mandatory after writing):
1. Replace the two most "correct" word choices with more unexpected ones.
2. Add at least one very short sentence (5 words or fewer) and one longer flowing one.
3. Add one moment of genuine hedging where it feels natural.
4. Find the most abstract sentence and rewrite it with a concrete detail.
5. Check the ending: if the last two lines feel like a conclusion, cut or rewrite. End on a specific detail or an open question.`;
}

// ---------------------------------------------------------------------------
// Convenience composites
// ---------------------------------------------------------------------------

/**
 * Combined humanisation block for short-form generators (comment replies,
 * engagement bot comments, tweet conversion). Includes vocabulary ban,
 * punctuation rules, and naturalness guidance — but NOT the full self-edit
 * humanisation pass (which is overkill for 1-3 sentence outputs).
 */
export function buildShortFormHumanisationBlock(): string {
  return [buildAntiAIVocabBlock(), buildPunctuationRulesBlock(), buildNaturalnessBlock()].join("\n\n");
}
