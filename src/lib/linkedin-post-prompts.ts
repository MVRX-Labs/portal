/**
 * Prompt style presets for the LinkedIn Post Generator tool.
 *
 * Each preset defines the creative-direction section of the prompt — hook style,
 * body tone/structure, humour guidance, and structural variance rules.  The shared
 * scaffolding (identity rules, hard rules, banned vocabulary, self-edit protocol,
 * humanisation pass, output format) is assembled by `buildPrompt()` in the trigger
 * task and is the same regardless of which preset is selected.
 *
 * Placeholders resolved at runtime:
 *   {{POSTER_NAME}}              – the person the post is written for
 *   {{HOOK_INSPIRATION_SECTION}} – randomly-selected hook templates
 *   {{BODY_A_CTA}}               – CTA / link guidance for Body A (varies by source URLs)
 *   {{BODY_B_LINK}}              – link guidance for Body B (varies by source URLs)
 */

import type { PromptPreset } from "./twitter-prompts";

export const LINKEDIN_POST_PROMPT_PRESETS: Record<string, PromptPreset> = {
  default: {
    label: "Sharp & Contrarian",
    description:
      "Contrarian hooks with an aggressive stance, punchy structure, and disruption moments — the original style.",
    template: `### HOOK REQUIREMENTS

Write 3 hook variations. Each hook:
- Is exactly 2 lines
- Maximum 12 words per line
- Uses a different angle or pattern (don't repeat structure across all 3)
- Sounds like {{POSTER_NAME}} wrote it, not a copywriter
- Takes a firm, slightly uncomfortable stance (contrarian edge)
- Starts mid-conflict or mid-scene, never with meta-commentary ("Here's why", "I've noticed", "Let's talk about")
- Uses strong, non-neutral verbs: kills, guts, breaks, fakes, buries, exposes
- Names concrete, visceral consequences, not abstract ones ("losing the deal in the final five minutes" not "enterprise readiness")
- Hooks the reader with an IDEA, TENSION, or QUESTION they personally relate to. Never hook with a company name, product name, or announcement. The reader should think "that's interesting, tell me more" not "this person is promoting something."

Hook structure to aim for (Bite and Twist):
- Line 1 (The Bite): Short, aggressive reaction or observation. Under 7 words. Sounds like someone calling it out in real time.
- Line 2 (The Twist): Visceral consequence that makes the reader feel the risk physically. Names the actor, not just the consequence.

{{HOOK_INSPIRATION_SECTION}}

### BODY A: LinkedIn Optimised (150-300 words)

Pick any of the 3 hooks to open with. Then write the body:
- Short paragraphs (1-3 sentences max), generous white space
- One idea per paragraph, building momentum line by line
- Include a "disruption" moment mid-post (a shift, twist, or unexpected detail)
- Narrative arc: setup, tension, resolution/insight
- Reference specific details from the source material (names, numbers, timeframes, quotes)
- Write from first person as {{POSTER_NAME}}. This is YOUR experience, YOUR insight, YOUR story. You lived it.
{{BODY_A_CTA}}
- 3-5 relevant hashtags at the end
- Never start with "I'm" or "We're"
- No generic corporate phrases ("thrilled to announce", "excited to share", "proud to")
- No company-pitching language. The company is backdrop, not the main character. (See Rule 7.)

### BODY B: Humanised (150-250 words)

Pick any of the 3 hooks to open with (can be the same or different from Body A). Then:

**ONE-THREAD RULE**: The entire post follows a single thread: one moment, one insight, one takeaway. Every sentence must serve that thread. If you remove a sentence and the post still makes the same point, cut it. Human writing is focused; rambling is not authentic, it is unfocused.

- Write entirely in first person as {{POSTER_NAME}}. This is you reflecting on your own experience and your own writing.
- Start from a specific moment (a conversation, a decision, a mistake), then land the insight within 2-3 short paragraphs. Get to the point faster than Body A, not slower.
- Use 1-2 soft qualifiers ("I think", "in my experience", "I'm probably biased here, but") but only where they add genuine nuance, not as filler.
- One aside or parenthetical maximum. It must earn its place by adding texture that makes the moment more vivid.
- Let the ending be quieter. End on a specific detail, an open question, or a soft invitation. Not a polished takeaway.
{{BODY_B_LINK}}
- The company name should appear at most once, and only if it's natural to the story. The reader should not feel marketed to at any point.
- Fewer or no hashtags.
- Soft CTA or none.

**LENGTH CHECK**: If Body B exceeds 250 words, cut from the middle. The opening moment and the closing insight are sacred. Everything between must justify its presence.

### WHAT HUMAN WRITING LOOKS LIKE (positive guidance)

- Anchor in a particular moment, not a general principle. Direction: particular to general.
- Use unexpectedly specific word choices. "Killed the deal" not "prevented adoption." "Clunky" not "suboptimal."
- Vary sentence rhythm dramatically. Very short. Then one that runs longer because the thought kept going. Jolting distribution: 7, 22, 6, 14 words.
- Let logic be slightly imperfect. One or two moments of genuine hedging per post.
- Include at least one throwaway detail that only someone who was there would mention.
- Use dry, observational humour sparingly (not puns, not enthusiasm, just a small aside that signals experience).

### DRY WIT (use sparingly, max 1-2 instances across the whole post)

- One sardonic side-eye about the gap between what people say in meetings and what's actually happening.
- Low-stakes analogies for high-stakes tech (e.g. "like that one kitchen drawer" instead of "complex legacy system").
- Self-deprecating expertise that undermines the author's own seniority to build trust.
- No exclamation marks for humour. No industry puns. No rhetorical "Right?" No emojis as laugh cues. No "I'll see myself out."

### STRUCTURAL VARIANCE

- Open with 2 punchy sentences (under 8 words each), then a medium sentence (12-15 words) for context.
- Include at least one parenthetical interjection or non-essential detail for texture.
- When describing something chaotic, use a long multi-clause sentence (25+ words). Follow with a very short declarative sentence (under 7 words).
- Avoid bridge conjunctions ("and," "but," "so") connecting two independent thoughts. Use a full stop instead.
- A paragraph should never have three sentences of similar length in a row.`,
  },

  narrative: {
    label: "Story-First",
    description: "Leads with personal scenes and specific moments — warmer, more intimate, less confrontational.",
    template: `### HOOK REQUIREMENTS

Write 3 hook variations. Each hook:
- Is exactly 2 lines
- Maximum 12 words per line
- Uses a different angle or pattern (don't repeat structure across all 3)
- Sounds like {{POSTER_NAME}} wrote it
- Opens with a specific scene, moment, or detail — the reader should feel dropped into the middle of something
- Never starts with a stance, opinion, or meta-commentary. Starts with what happened.
- Uses sensory or situational language: what {{POSTER_NAME}} saw, heard, or realised in a concrete moment
- Creates curiosity through specificity, not provocation. The reader thinks "what happened next?" not "do I agree?"
- Hooks with a MOMENT or SCENE the reader can picture. Never hook with a company name, product name, or announcement.

Hook structure to aim for (Scene and Question):
- Line 1 (The Scene): A specific moment described in under 7 words. Grounded in time or place.
- Line 2 (The Question): What that moment revealed or made {{POSTER_NAME}} question. Creates forward pull.

Examples of the feel (do NOT copy these verbatim):
- "Three weeks in, the dashboard was lying to us." / "Every metric said growth. Our users said otherwise."
- "I watched a VP rewrite the entire proposal at midnight." / "The version that won had none of our original ideas."

{{HOOK_INSPIRATION_SECTION}}

### BODY A: LinkedIn Optimised (150-300 words)

Pick any of the 3 hooks to open with. Then write the body:
- Build a narrative arc: ground the reader in a specific situation, then show what shifted
- Show, don't tell: describe what happened before stating what it meant
- Use dialogue or paraphrased conversation where it adds texture ("She said something like..." or "The feedback was blunt:")
- 1-3 sentence paragraphs, but allow one slightly longer paragraph (4 sentences) if the story needs it
- The insight emerges from the story, not from a summary. The reader should arrive at the takeaway themselves.
- Reference specific details from the source material (names, numbers, timeframes, quotes)
- Write from first person as {{POSTER_NAME}}. This is YOUR story. You were there.
{{BODY_A_CTA}}
- 3-5 relevant hashtags at the end
- Never start with "I'm" or "We're"
- No generic corporate phrases ("thrilled to announce", "excited to share", "proud to")
- No company-pitching language. The company is backdrop, not the main character. (See Rule 7.)

### BODY B: Humanised (150-250 words)

Pick any of the 3 hooks to open with (can be the same or different from Body A). Then:

**SINGLE SCENE RULE**: The entire post lives inside one scene, one conversation, or one realisation. Do not zoom out to a general lesson. Stay in the specific. The reader extracts the lesson themselves.

- Write entirely in first person as {{POSTER_NAME}}. This is you remembering a moment.
- Start mid-scene: a conversation, a room, a specific day. No preamble, no setup paragraph.
- Use the kind of details that prove you were there: what the room looked like, what someone actually said, the specific feeling in the moment.
- Use 2-3 soft qualifiers ("I think", "honestly", "I didn't expect") — they add vulnerability, not weakness.
- End in the moment, not after it. The post stops while the story is still warm. No neat conclusions.
{{BODY_B_LINK}}
- The company name should appear at most once, and only if it's natural to the scene. The reader should not feel marketed to at any point.
- Fewer or no hashtags.
- Soft CTA or none — if present, it should feel like an invitation to share a similar moment, not to engage with content.

**LENGTH CHECK**: If Body B exceeds 250 words, cut from the middle. The opening scene and the closing moment are sacred. Everything between must justify its presence.

### WHAT HUMAN WRITING LOOKS LIKE (positive guidance)

- Write from inside the moment, not above it. The reader should feel like they're standing next to {{POSTER_NAME}}.
- Specific sensory details beat abstract insights: "the Slack message at 11pm" beats "we communicated asynchronously."
- Let the story breathe. Not every sentence needs to advance the argument. Some details exist to make the scene real.
- Use transitions that feel like memory: "That's when..." / "Looking back..." / "I didn't realise until later that..."
- Include one throwaway detail that only someone who was there would mention.
- Emotion through understatement. "That was a hard week" hits harder than "It was absolutely devastating."

### WARMTH & VOICE (use throughout, but never force)

- Self-awareness without self-flagellation: "I got this wrong" not "I'm a terrible leader."
- Genuine uncertainty: "I'm still not sure we made the right call" — this builds trust.
- Warmth through specificity about other people: credit someone by what they actually did, not by their title.
- No exclamation marks. No inspirational quotes. No "and that's the lesson" framing. No emojis as emotional shorthand.

### STRUCTURAL VARIANCE

- Open by dropping into a scene (a sentence of action or dialogue), then a beat of reflection (1 sentence), then back to the story.
- Allow one paragraph to run 3-4 sentences when the narrative momentum demands it.
- Vary paragraph length: 1 sentence, then 3, then 1, then 2. Never three paragraphs of similar length in a row.
- Use fragments for emphasis, but sparingly: "Just one metric. The wrong one."
- End paragraphs mid-thought occasionally — let the white space do work.`,
  },

  analytical: {
    label: "Data & Insight",
    description: "Leads with surprising findings or numbers — structured, evidence-driven, analytical tone.",
    template: `### HOOK REQUIREMENTS

Write 3 hook variations. Each hook:
- Is exactly 2 lines
- Maximum 12 words per line
- Uses a different angle or pattern (don't repeat structure across all 3)
- Sounds like {{POSTER_NAME}} wrote it
- Leads with a surprising finding, number, or counterintuitive observation
- The reader should think "that can't be right" or "I need to know why"
- Uses specific data points, timeframes, or quantities — not vague claims
- Creates curiosity through evidence, not provocation. The reader wants to understand, not argue.
- Hooks with an INSIGHT or FINDING the reader didn't expect. Never hook with a company name, product name, or announcement.

Hook structure to aim for (Finding and Implication):
- Line 1 (The Finding): A specific data point, result, or observation. Concrete and surprising.
- Line 2 (The Implication): What this means that nobody is talking about. Makes the reader reassess something they assumed.

Examples of the feel (do NOT copy these verbatim):
- "We tracked onboarding for 6 months straight." / "The feature everyone loved was the one killing retention."
- "84% of the pipeline came from 3 posts." / "None of them mentioned the product."

{{HOOK_INSPIRATION_SECTION}}

### BODY A: LinkedIn Optimised (150-300 words)

Pick any of the 3 hooks to open with. Then write the body:
- Structure around 2-4 key findings or observations, presented in a clear sequence
- Lead each point with the evidence, then the interpretation. Never the other way around.
- Use numbered insights (1., 2., etc.) or clear paragraph breaks between findings — the reader should be able to scan and still get value
- Include specific numbers, timeframes, comparisons, and ratios from the source material
- One "reversal" moment: a finding that contradicts the obvious assumption
- Write from first person as {{POSTER_NAME}}. This is YOUR research, YOUR data, YOUR discovery. You did the work.
{{BODY_A_CTA}}
- 3-5 relevant hashtags at the end
- Never start with "I'm" or "We're"
- No generic corporate phrases ("thrilled to announce", "excited to share", "proud to")
- No company-pitching language. The company is backdrop, not the main character. (See Rule 7.)

### BODY B: Humanised (150-250 words)

Pick any of the 3 hooks to open with (can be the same or different from Body A). Then:

**ONE INSIGHT RULE**: The entire post unpacks a single finding or observation. Go deep on one thing rather than wide on many. Every sentence either presents evidence or explains why it matters.

- Write entirely in first person as {{POSTER_NAME}}. This is you sharing what you discovered and what you make of it.
- Start with the finding that surprised you most, then explain why it surprised you. Context first, then data, then what you think it means.
- Use "I expected X, but found Y" framing — not as a gimmick, but because that's how real discovery works.
- Ground abstract findings in a specific moment: "I was looking at the dashboard when I noticed..." not "Analysis revealed that..."
- End with the question the data raised, not the answer. The best analytical posts leave the reader thinking, not nodding.
{{BODY_B_LINK}}
- The company name should appear at most once, and only if it's natural to the analysis. The reader should not feel marketed to at any point.
- Fewer or no hashtags.
- Soft CTA or none — if present, ask what others have found, not what they think.

**LENGTH CHECK**: If Body B exceeds 250 words, cut from the middle. The opening finding and the closing question are sacred. Everything between must justify its presence.

### WHAT HUMAN WRITING LOOKS LIKE (positive guidance)

- Specific numbers beat round numbers: "23 days" not "about a month." "3.2x" not "significant improvement."
- Admit what the data doesn't tell you. "We don't know why yet" is more credible than a neat explanation.
- Use comparison and contrast: "Company A did X, Company B did Y. Same market, opposite results."
- Show your working: how did you find this? What were you looking for? What did you expect?
- Include the detail that almost made you dismiss the finding before you realised it was the finding.
- Intellectual honesty: one caveat or limitation per post keeps you credible.

### ANALYTICAL WIT (use sparingly, max 1-2 instances across the whole post)

- Pattern-recognition humour: "Every team says they're data-driven. Then you ask for the dashboard password."
- Understated irony about the gap between what data shows and what people believe.
- Self-aware analytical voice: "I spent a week on this analysis. The answer was in the first hour."
- No exclamation marks. No rhetorical "Right?" No emojis. No "mind = blown" energy.

### STRUCTURAL VARIANCE

- Open with the key finding in 1-2 short sentences, then a longer sentence providing context or methodology.
- Use mini-lists (2-4 items) for multiple findings, but vary the format: some as dashes, some as numbered items, some woven into prose.
- Alternate between data sentences (short, declarative) and interpretation sentences (longer, more exploratory).
- One paragraph should be noticeably shorter than the rest — the one that drops the most surprising finding.
- A paragraph should never have three sentences of similar length in a row.`,
  },
};

/** Context needed to resolve placeholders in LinkedIn post style templates. */
export interface LinkedInPromptContext {
  posterName: string;
  hookInspirationSection: string;
  bodyACta: string;
  bodyBLink: string;
}

/** Replace {{PLACEHOLDER}} markers in a LinkedIn post style template. */
export function resolveLinkedInPromptTemplate(template: string, ctx: LinkedInPromptContext): string {
  return template
    .replace(/\{\{POSTER_NAME\}\}/g, ctx.posterName)
    .replace(/\{\{HOOK_INSPIRATION_SECTION\}\}/g, ctx.hookInspirationSection)
    .replace(/\{\{BODY_A_CTA\}\}/g, ctx.bodyACta)
    .replace(/\{\{BODY_B_LINK\}\}/g, ctx.bodyBLink);
}
