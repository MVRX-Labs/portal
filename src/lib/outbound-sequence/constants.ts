/**
 * Constants for outbound sequence generation — banned phrases, character limits,
 * best-practice reference text baked into prompts.
 */

/** Hard character limits enforced by LinkedIn / HeyReach */
export const CHAR_LIMITS = {
  connectionRequest: 300,
  dmTarget: 400,
  dmHardMax: 600,
  inmail: 1900,
} as const;

/** Phrases that must NEVER appear in generated copy */
export const BANNED_PHRASES = [
  "I hope this message finds you well",
  "I hope this finds you well",
  "I came across your impressive profile",
  "I came across your profile",
  "I'd love to pick your brain",
  "I believe there's a great synergy",
  "explore synergies",
  "I help companies like yours",
  "Are you the right person to speak with",
  "I noticed you're a leader in",
  "Just wanted to touch base",
  "circle back",
  "leverage",
  "streamline",
  "cutting-edge",
  "revolutionary",
  "innovative solution",
  "disruptive",
  "scalable",
  "robust",
  "best practices",
  "low-hanging fruit",
  "move the needle",
  "game-changer",
  "paradigm shift",
  "thought leader",
  "deep dive",
  "at the end of the day",
  "on the same page",
  "win-win",
  "value-add",
  "pain points",
  "reach out",
  "touching base",
  "circle back",
  "take this offline",
] as const;

/**
 * Tone calibration per touchpoint type.
 * Embedded in the generation prompt as reference.
 */
export const TONE_BY_STEP: Record<string, { tone: string; energy: string }> = {
  connection_request: { tone: "Curious peer", energy: "Low-key, warm" },
  first_dm: { tone: "Thoughtful colleague", energy: "Helpful, not eager" },
  follow_up: { tone: "Casual check-in", energy: "Relaxed, adds value" },
  social_proof: { tone: "Direct but respectful", energy: "Confident, gives easy out" },
  breakup: { tone: "Lighthearted", energy: '"No hard feelings" energy' },
  engage_post: { tone: "N/A", energy: "Like or comment on their content" },
};

/**
 * Sequence structure templates — defines the skeleton each sequence type follows.
 * The AI fills in the content; these define the step types and timing.
 */
export const SEQUENCE_STRUCTURES = {
  full: {
    id: "full" as const,
    name: "Full Sequence (7-9 steps)",
    description: "Complete multi-touch sequence with engagement warmup, value-add messages, and graceful breakup",
    steps: [
      {
        type: "connection_request" as const,
        delayDays: 0,
        intent: "Get accepted — no pitch, just a reason to connect",
      },
      { type: "message" as const, delayDays: 3, intent: "Value-first message — share an insight, no ask" },
      { type: "message" as const, delayDays: 4, intent: "Follow-up with new value — different angle, light CTA" },
      { type: "engage_post" as const, delayDays: 3, intent: "Like or comment on their recent post" },
      { type: "message" as const, delayDays: 3, intent: "Share a resource or case study — medium CTA" },
      { type: "message" as const, delayDays: 4, intent: "Direct pitch with social proof — clear CTA" },
      { type: "engage_post" as const, delayDays: 3, intent: "Second engagement touchpoint" },
      { type: "message" as const, delayDays: 4, intent: "Breakup message — graceful close, leave door open" },
    ],
  },
  medium: {
    id: "medium" as const,
    name: "Medium Sequence (5-6 steps)",
    description: "Compressed sequence — fewer follow-ups, faster cadence, still value-led",
    steps: [
      { type: "connection_request" as const, delayDays: 0, intent: "Get accepted — personalized hook" },
      { type: "message" as const, delayDays: 3, intent: "Value-first message — specific insight or finding" },
      { type: "engage_post" as const, delayDays: 3, intent: "Engage with their content" },
      { type: "message" as const, delayDays: 4, intent: "Social proof + clear but soft CTA" },
      { type: "message" as const, delayDays: 5, intent: "Breakup — light, no pressure" },
    ],
  },
  short: {
    id: "short" as const,
    name: "Short Sequence (3-4 steps)",
    description: "Aggressive, direct sequence — connect, hit with value, ask, close",
    steps: [
      { type: "connection_request" as const, delayDays: 0, intent: "Get accepted with a strong, specific hook" },
      { type: "message" as const, delayDays: 3, intent: "Lead with strongest value — insight + resource offer" },
      { type: "message" as const, delayDays: 5, intent: "Direct CTA with social proof + easy out" },
      { type: "message" as const, delayDays: 5, intent: "Breakup — one-liner, leave door open" },
    ],
  },
} as const;

/** Reference example of a well-performing sequence (anonymized from 60x doc) */
export const REFERENCE_SEQUENCE_EXAMPLE = `
REFERENCE: Real high-performing LinkedIn outbound sequence (9 steps, ~24 days)

Step 1: Connection Request — No message (blank). Let profile views and mutual context do the work.

Step 2 (Day 3): First DM — Three CTA variants tested:
  - Variant A: "Hey [name], saw you're leading [function] at [company]. I've got a WhatsApp group of [industry] operators that I think you'll find interesting. Gimme a ping on WhatsApp if you're keen to join and will add you - [link]"
  - Variant B: "Hey [name], saw you're leading [function] at [company]. We're comparing notes across a handful of [industry] teams on [topic]. Gimme a ping on WhatsApp if that's helpful and can share - [link]"
  - Variant C: "Hi [name]! Great to connect; it could be interesting to discuss [shared topic], given tangential roles. Would be great to share intros."

Step 3 (Day 5): Chase — "Hey, just chasing this!" (Short, casual, no new content)

Step 4 (Day 9): Value-add — Share a relevant article or insight + position expertise:
  "[Publication] recently wrote this article on [relevant topic] - [link]. Keen to hear your thoughts, we're specialists in [area] / we [specific thing you did], and it has been one of the best decisions yet."

Step 5 (Day 12): Like/Engage Post — No message, just engage with their content.

Step 6 (Day 15): Resource offer — "Thought this could be worth the share: If you're like me, you probably have [common challenge]. I built a simple [resource] for this. Can send you the doc if you'd like?"

Step 7 (Day 19): Direct pitch — "I figured it might be worthwhile to share what we do. Everyone's [doing X] now, and a lot of those projects are [problem]. TLDR: We work with [similar companies/industries], including [name drop], to [what you do]. We come in and [specific value]. Would you be interested in hearing how we do this and why it's so important?"

Step 8 (Day 22): Like Post — Second engagement touchpoint.

Step 9 (Day 24): Breakup — "Assuming now's not a good time to share introductions. If you'd ever like to discuss [topic] or have any questions to do with [relevant area] at [company name], feel free to reach out."

KEY OBSERVATIONS from this sequence:
- Connection request is BLANK — relies on profile quality and prior engagement
- First DM is community/value-led, NOT a pitch
- Multiple CTA variants tested simultaneously (A/B/C)
- Chase message is deliberately short and casual
- Value-add shares external content, not self-promotion
- Resource offer is specific and tangible
- Direct pitch comes late (Step 7 of 9) and names specific companies
- Breakup is graceful, leaves door open, references their specific domain
- Mix of message types: value, chase, engagement, resource, pitch, breakup
`.trim();
