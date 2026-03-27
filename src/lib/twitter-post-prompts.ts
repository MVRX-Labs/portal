/**
 * Prompt style presets and format builders for the Twitter Post Generator.
 *
 * Presets define **tone and creative direction** that applies equally to all
 * three output formats (single tweet, thread, long post). Format-specific
 * structural guidance lives in the builder functions below.
 *
 * Placeholders resolved at runtime:
 *   {{POSTER_NAME}} – the person the content is written for
 */

import type { PromptPreset } from "./twitter-prompts";

// ---------------------------------------------------------------------------
// Style presets (tone & creative direction — format-agnostic)
// ---------------------------------------------------------------------------

export const TWITTER_POST_PROMPT_PRESETS: Record<string, PromptPreset> = {
  default: {
    label: "Punchy & Direct",
    description: "Sharp hooks, strong opinions, tight sentences — the default Twitter voice.",
    template: `### CREATIVE DIRECTION

Write sharp, opinionated content. {{POSTER_NAME}} is known for cutting through noise with conviction.

**Voice:**
- Short, punchy sentences. Fragments for emphasis. One-word beats between longer thoughts.
- Strong, non-neutral verbs: "killed" not "impacted", "shipped" not "delivered"
- Specific beats vague: "23 days" not "a few weeks", "$47K" not "significant revenue"
- Contractions always. Casual punctuation — periods for weight, dashes for asides, questions to provoke.
- One moment of dry humour max per piece.
- Bold claims backed by specifics. No hedging, no both-sides balance.

**Avoid:**
- Throat-clearing openers ("Here's the thing", "Let me explain", "I've been thinking about")
- Balanced both-sides takes — pick a side
- Generic corporate language or buzzwords
- Neat conclusions — end with tension, a question, or an open thought`,
  },

  story: {
    label: "Story-Driven",
    description: "Scene-by-scene unfolding — specific moments, sensory details, understatement.",
    template: `### CREATIVE DIRECTION

Write story-driven content. {{POSTER_NAME}} draws people in by dropping them into specific moments.

**Voice:**
- Open with a specific scene, moment, or turning point — drop the reader into the middle of something
- Sensory details: the time, the place, the exact words someone said
- Slightly imperfect logic — real stories have loose ends
- Understatement over drama: "That was a hard week" > "It was devastating"
- Dialogue or paraphrased quotes for texture: "She said: 'That's not what the data shows.'"
- One throwaway detail per piece that only someone who was there would mention
- The lesson emerges from the story — never stated as a separate "takeaway"

**Avoid:**
- Abstract openings or thesis statements
- Telling instead of showing: "The meeting went badly" vs "She closed the laptop mid-sentence"
- Neat narrative arcs — life doesn't wrap up cleanly
- Explicit morals, "And here's what I learned..." summaries, or bolted-on conclusions`,
  },

  analytical: {
    label: "Data & Insights",
    description: "Number-led with surprising findings — research voice with intellectual honesty.",
    template: `### CREATIVE DIRECTION

Write data-driven content. {{POSTER_NAME}} leads with evidence and lets the numbers tell the story.

**Voice:**
- Lead with the most surprising number or finding — the "that can't be right" moment
- Specific numbers always: "23 days" not "about a month", "3.2x" not "significant improvement"
- Evidence first, interpretation second. Show your working.
- Comparison and contrast: "Company A did X, Company B did Y. Same market, opposite results."
- One counterintuitive finding per piece that challenges the obvious assumption
- Intellectual honesty: acknowledge what the data doesn't tell you, admit limitations
- Self-aware analytical voice: "I spent a week on this. The answer was in the first hour."

**Avoid:**
- Round numbers when specific ones exist
- Conclusions without evidence
- Hiding caveats or limitations
- Dry academic tone — this is Twitter, not a journal`,
  },
};

// ---------------------------------------------------------------------------
// Format types
// ---------------------------------------------------------------------------

export type TwitterPostFormat = "single-tweet" | "thread" | "long-post";

// ---------------------------------------------------------------------------
// Resolve creative direction from preset or custom prompt
// ---------------------------------------------------------------------------

/**
 * Resolve the creative direction text. If the user provided a custom/edited
 * prompt use that; otherwise fall back to the named preset (or "default").
 * Replaces the {{POSTER_NAME}} placeholder.
 */
export function resolveCreativeDirection(posterName: string, customPrompt?: string, promptStyle?: string): string {
  let raw: string;
  if (customPrompt?.trim()) {
    raw = customPrompt;
  } else {
    const preset = TWITTER_POST_PROMPT_PRESETS[promptStyle || "default"] || TWITTER_POST_PROMPT_PRESETS.default;
    raw = preset.template;
  }
  return raw.replace(/\{\{POSTER_NAME\}\}/g, posterName);
}

// ---------------------------------------------------------------------------
// Format-specific creative direction + output format
// ---------------------------------------------------------------------------

/**
 * Single-tweet format section.
 *
 * Research baked in: 70–150 char sweet spot, front-load impact,
 * questions for replies, line breaks for read-through.
 */
export function buildSingleTweetSection(
  posterName: string,
  creativeDirection: string,
  hookInspirationSection: string,
  sourceLinkGuidance: string
): string {
  return `### FORMAT: SINGLE TWEET (≤280 CHARACTERS)

One standalone tweet. Not a thread opener — a complete thought that needs nothing else.

### THE ART OF THE SINGLE TWEET

The best tweets compress maximum insight into minimum words. They feel effortless — like they took 5 seconds to write but contain hours of thinking.

- Front-load the sharpest word. Scrollers decide in the first 5 words whether to stop.
- One idea only. No "also" or "and another thing." Ruthless focus.
- 70–150 characters is the sweet spot for engagement — use more only if the idea demands it, never exceed 280
- Strong takes get shared. Balanced takes get scrolled past. Pick a side.
- Questions drive significantly more replies than statements — but only genuine questions, not rhetorical fluff
- A line break in the middle creates a visual pause that increases read-through
- End on an open loop, a provocation, or a punchline — never a period that seals the thought shut
- Zero hashtags unless one is genuinely load-bearing
- If the source material has a key number, lead with it — specificity stops the scroll

${creativeDirection}

${hookInspirationSection}

### YOUR TASK

Generate 5 single-tweet variations from the source material. Each must:
- Be a complete, standalone thought (≤280 characters each)
- Take a distinctly different angle on the source material
- Sound like ${posterName} typed it between meetings
- Need no thread or context to land
${sourceLinkGuidance}

### OUTPUT FORMAT

## TWEET 1
[Tweet text — max 280 characters]
(X characters)

## TWEET 2
[Tweet text — max 280 characters]
(X characters)

## TWEET 3
[Tweet text — max 280 characters]
(X characters)

## TWEET 4
[Tweet text — max 280 characters]
(X characters)

## TWEET 5
[Tweet text — max 280 characters]
(X characters)

## NOTES
- **Recommended**: Which tweet to post and why
- **Best for replies**: Which will drive the most conversation
- **Angle not used**: What perspective was left on the table`;
}

/**
 * Thread format section.
 *
 * Research baked in: 4–8 tweet optimal length, hook tweet is 80% of success,
 * each tweet independently retweetable, engagement drops after tweet 5,
 * questions in close drive 3x replies.
 */
export function buildThreadSection(
  posterName: string,
  creativeDirection: string,
  hookInspirationSection: string,
  sourceLinkGuidance: string
): string {
  return `### FORMAT: TWITTER THREAD

A multi-tweet thread that builds momentum tweet by tweet.

### THE ART OF THE THREAD

Threads are Twitter's native long-form. The hook tweet is 80% of the thread's success — if that doesn't stop the scroll, nothing else matters.

${creativeDirection}

### HOOK REQUIREMENTS

Write 3 hook tweet variations. Each hook tweet:
- Is a single tweet (max 280 characters)
- Uses a different angle or pattern (don't repeat structure across all 3)
- Sounds like ${posterName} typed it off the cuff, not crafted by a copywriter
- Takes a firm stance — Twitter rewards conviction over balance
- Starts with the sharpest idea, not throat-clearing
- Ends with a reason to keep reading: ↓ or "Thread:" or a curiosity gap
- Hooks with an IDEA, TENSION, or QUESTION — never a company name or announcement

${hookInspirationSection}

### THREAD BODY (4–7 tweets after the hook, each max 280 characters)

Pick any of the 3 hooks to open with. Then write the thread:
- One idea per tweet. Each tweet should deliver value even if read in isolation.
- Use line breaks within tweets — never a wall of text
- Include specific details from the source material (names, numbers, timeframes)
- Build momentum: each tweet should make the reader want the next one
- End each body tweet with forward pull (tension, curiosity, unfinished thought)
- Write from first person as ${posterName}. This is YOUR experience, YOUR insight.
${sourceLinkGuidance}
- Never start with "I'm" or "We're"
- No generic corporate phrases
- Vary tweet length: some 50 characters, some 250. Never all the same.

### CLOSE (final tweet)

- Strong close that drives replies: a specific question, an invitation to share experiences, or a sharp callback to the hook
- Never "Follow for more" or generic CTAs
- Under 200 characters preferred (leaves room for quote tweets)

### OUTPUT FORMAT

Present your output in exactly this structure:

## HOOK 1
[Hook tweet 1 — max 280 chars]

## HOOK 2
[Hook tweet 2 — max 280 chars]

## HOOK 3
[Hook tweet 3 — max 280 chars]

---

## THREAD A — Engagement Optimised

TWEET 1
[Hook tweet]

TWEET 2
[Body tweet]

TWEET 3
[Body tweet]

...

TWEET N
[Close tweet]

---

## THREAD B — Humanised

TWEET 1
[Hook tweet]

TWEET 2
[Body tweet]

...

TWEET N
[Close tweet]

---

## NOTES

- **Recommended hook**: [Which hook to lead with and why]
- **Best tweet**: [Which individual tweet is strongest standalone]
- **Omitted elements**: [What was left out and why]`;
}

/**
 * Long-post format section.
 *
 * Research baked in: first 280 chars = timeline preview, 800–2,000 words optimal,
 * short paragraphs for scannability, bold text for scan-and-share,
 * surprise section is the sharing trigger.
 */
export function buildLongPostSection(
  posterName: string,
  creativeDirection: string,
  sourceLinkGuidance: string
): string {
  return `### FORMAT: LONG POST (TWITTER/X PREMIUM)

Write a single long-form post using Twitter/X's expanded character limit (up to 25,000 characters). Think mini-essay in Twitter voice — conversational depth, not formal article.

### THE ART OF THE LONG POST

Long posts win when they deliver depth without losing the Twitter feel:

- **The first 280 characters are everything.** They show as the timeline preview. This IS your hook — if they don't stop scrolling here, the depth below never gets read.
- Optimal length: 800–2,000 words. Long enough to go genuinely deep, short enough to hold a scrolling reader.
- Keep the conversational Twitter voice throughout. This is not a LinkedIn article or Medium post. Write like you talk, with all the contractions and fragments that implies.
- **Structure for scanners**: short paragraphs (2–3 sentences max), frequent line breaks, clear visual rhythm.
- Use 2–3 headers to signal major sections in a 1,000-word post. Not more — this isn't a blog.
- Bullet points and numbered lists for frameworks, findings, or steps — they break up density and increase sharing.
- Bold text sparingly for the key phrases a scanner's eye should catch.
- Every paragraph must earn its place. If it doesn't add genuine insight, cut it.
- Include one section that surprises: a contrarian take, a personal failure, a counterintuitive finding. This is what gets the post shared.
- The depth advantage: you can show your working, include real examples, and acknowledge nuance that a 280-character tweet cannot.
- End with a question or open thought. Long posts that end too cleanly feel like content marketing.

${creativeDirection}

### YOUR TASK

Write 2 long-post versions from the source material:

**VERSION A — Structured**
More headers, shorter paragraphs, bulleted sections where appropriate. Optimised for scanners who skim then decide to read fully.

**VERSION B — Narrative**
Fewer headers, longer paragraphs, story-driven flow. Optimised for readers who commit from the first line.

Both versions must:
- Open with a killer first paragraph (the 280-char timeline preview). This single paragraph determines whether anyone reads the rest.
- Go genuinely deep into the source material — specific details, examples, numbers, analysis
- Sound like ${posterName} sat down and wrote something they actually cared about
- Include at least one moment of genuine surprise or contrarian insight
- Be 800–2,000 words
${sourceLinkGuidance}

### OUTPUT FORMAT

## VERSION A — STRUCTURED

[Full long-form post text]

Word count: [X]

---

## VERSION B — NARRATIVE

[Full long-form post text]

Word count: [X]

---

## NOTES
- **Recommended version**: Which version to post and why
- **Strongest section**: Which part is most shareable as a standalone quote-tweet
- **Hook assessment**: How the opening 280 chars will perform in the timeline`;
}
