/**
 * Constants for outbound sequence playbook generation — banned phrases, character limits,
 * templated strategic sections, and reference examples.
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

// ─── Templated Strategic Sections ───────────────────────────

/** LinkedIn outbound benchmark data — static, used in every playbook */
export const BENCHMARKS_TABLE = [
  { audienceType: "Warm / semi-warm audiences", acceptRate: "45–59%", replyRate: "25–30%", context: "Best case" },
  {
    audienceType: "Targeted cold outbound (good messaging)",
    acceptRate: "30–40%",
    replyRate: "15–25%",
    context: "Where we aim",
  },
  {
    audienceType: "Generic cold outbound (weak messaging)",
    acceptRate: "15–25%",
    replyRate: "5–10%",
    context: "Industry average",
  },
] as const;

export const BENCHMARKS_BODY =
  "The variance is wide. Warm accounts (people who've engaged with the sender's content, share mutual connections, or are in a related space) can hit 59% acceptance and 30% reply. Completely cold outbound with no personalisation or relevance sits below 10% reply.\n\nAcross past MVRX campaigns for other clients, we've consistently landed in the 33–39% connection acceptance range and 11–25% message reply range. The campaigns where messaging was tighter and more personalised outperformed the generic ones by roughly 2x on reply rate. That's the lever we're pulling hardest.";

/** Structural A/B test comparison — static template */
export const STRUCTURAL_TESTS_TABLE = [
  {
    variable: "Pre-connect warmup",
    standard: "View profile + like post, then connect next day",
    aggressive: "Connect immediately, no warmup",
  },
  {
    variable: "Time to first message",
    standard: "3 days after acceptance",
    aggressive: "Same day as acceptance",
  },
  {
    variable: "Follow-up gap",
    standard: "5 days between Msg 1 and Msg 2",
    aggressive: "3 days between Msg 1 and Msg 2",
  },
  {
    variable: "Breakup timing",
    standard: "7 days after Msg 2 (Day 16 total)",
    aggressive: "5 days after Msg 2 (Day 9 total)",
  },
  {
    variable: "Total sequence length",
    standard: "~16 days",
    aggressive: "~9 days",
  },
] as const;

export const STRUCTURAL_TESTS_HOW_TO_RUN =
  "Split each lead tier 50/50 between Structure A and Structure B, holding copy constant. After 200+ leads per structure have completed the full sequence, compare reply rates and positive sentiment rates. The structure test runs in parallel with the copy A/B/C test, but on separate lead batches to avoid cross-contamination.";

/** Additional structural variables to test in later rounds — static */
export const ADDITIONAL_TEST_VARIABLES = [
  {
    variable: "Number of follow-ups",
    whatWeTest:
      "2 follow-ups (current) vs 1 follow-up vs 3 follow-ups. More touches can mean more replies, but can also mean more unconnects.",
  },
  {
    variable: "Profile view after acceptance",
    whatWeTest:
      "View their profile again right before sending Message 1. They get a notification, open LinkedIn, and your message is there. Timing play.",
  },
  {
    variable: "Post engagement mid-sequence",
    whatWeTest:
      "Like or comment on a post between Msg 1 and Msg 2 instead of just waiting. Keeps you visible without being pushy.",
  },
  {
    variable: "Day of week",
    whatWeTest:
      "Send connection requests on Tuesday/Wednesday (peak LinkedIn) vs Sunday evening (less competition, people browse casually).",
  },
  {
    variable: "Sender account",
    whatWeTest:
      "Test whether different sender accounts outperform each other. Sender profile strength and relevance matter.",
  },
] as const;

export const TEST_SEQUENCING_PLAN =
  "We don't run all tests at once. Round 1: copy variants (A/B/C) + structure variants (A/B) on low-priority leads. Round 2: take the winners, test the next set of structural variables on mid-priority leads. Round 3: run the proven combination on high-priority leads. Each round takes 2–3 weeks.";

/** Statistical significance guidance — static */
export const STATISTICAL_SIGNIFICANCE_TABLE = [
  {
    metric: "Connection Accept Rate",
    baselineRate: "35%",
    minDetectableEffect: "+/- 10pp",
    leadsPerVariant: "~175",
    totalForABC: "~525",
  },
  {
    metric: "Message Reply Rate",
    baselineRate: "20%",
    minDetectableEffect: "+/- 10pp",
    leadsPerVariant: "~200",
    totalForABC: "~600",
  },
  {
    metric: "Message Reply Rate (detect 5pp diff)",
    baselineRate: "20%",
    minDetectableEffect: "+/- 5pp",
    leadsPerVariant: "~725",
    totalForABC: "~2,175",
  },
] as const;

export const STATISTICAL_SIGNIFICANCE_BODY =
  "For a standard two-proportion z-test at 95% confidence (p < 0.05) and 80% power, the sample size per variant depends on two things: the baseline rate you're comparing against, and the minimum detectable effect (MDE) you care about. In plain English: how big a difference do you need to see before it's real and not random.";

/** Decision framework — static */
export const DECISION_FRAMEWORK = [
  {
    scenario: "One variant clearly ahead by 10pp+",
    whatToDo: "Pick the winner, kill the others, roll out",
    why: "Statistically significant with 200 leads/variant",
  },
  {
    scenario: "Two variants within 5pp of each other",
    whatToDo: "Keep both running, increase sample to 500+/variant",
    why: "Need more data to separate signal from noise",
  },
  {
    scenario: "All three variants within 3pp",
    whatToDo: "Pick on qualitative grounds (tone, brand fit) and move on",
    why: "The difference is too small to matter. Don't over-optimise.",
  },
] as const;

/** Default capacity model for 2 LinkedIn accounts */
export const DEFAULT_CAPACITY_MODEL = [
  { week: "Week 1", perAccount: 100, total: 200, cumulative: 200, phase: "Ramp-up" },
  { week: "Week 2", perAccount: 100, total: 200, cumulative: 400, phase: "Ramp-up" },
  { week: "Week 3", perAccount: 200, total: 400, cumulative: 800, phase: "Full speed" },
  { week: "Week 4", perAccount: 200, total: 400, cumulative: 1200, phase: "Full speed" },
] as const;

export const CAPACITY_MODEL_INTRO =
  "LinkedIn limits each account to ~200 connection requests per week. New accounts (or accounts that haven't been sending at volume) need to ramp up: 100/week in weeks 1-2, then 200/week from week 3.";

/** Reference example of a well-performing sequence playbook (based on Odin golden example) */
export const REFERENCE_SEQUENCE_EXAMPLE = `
REFERENCE: Real high-performing LinkedIn outbound sequence from a playbook (Sequence 1 of 3)

Context: This sequence targeted UK VCs & Angels — the broadest, coldest list. Connection request sent with no note. A/B/C testing on Message 1 copy.

Sequence flow:
  Step 1: View Profile — Warm the algorithm. Shows you looked. (Structure B skips this.)
  Step 2: Like Recent Post — If they've posted in last 30 days, like their most recent post. (Structure B skips this.)
  Step 3: Connection Request — No note. Blank request. Higher acceptance rate on cold audiences.
  Step 4: Message 1 — Value-first opening message. A/B/C variants below. (Day 4 for Standard, Day 0 for Aggressive)
  Step 5: Message 2 — Short follow-up. One sentence, low friction. (Day 9 / Day 3)
  Step 6: Message 3 — Breakup message. Graceful exit with door open. (Day 16 / Day 8)

Message 1 Variants (A/B/C):

A: Thanks for connecting, {first_name}. Quick one: are you running any SPVs or syndicated deals at the moment? Curious who you use for the structuring side.

B: Appreciate the connect, {first_name}. I'm at [Company]. We've been working with a growing number of VCs and angels this year on SPV infrastructure. Out of interest, who do you currently use for deal structuring?

C: Good to connect, {first_name}. Have you looked at setting up your own fund or SPV structure? We're seeing more people in your world doing it this year. Happy to compare notes if useful.

What we're testing: A asks directly who they use (pure question, no pitch). B names the company upfront then asks (mild social proof + question). C doesn't mention the company at all, just opens a conversation about the trend. We expect A to generate the highest reply rate because it's short and genuinely curious.

Message 2 (Follow-up) — consistent across variants:
  Just bumping this in case it got buried, {first_name}. Genuinely curious about your setup. No pitch, just interested to hear what you use.

Message 3 (Breakup) — consistent across variants:
  All good if the timing's off, {first_name}. If you ever want to compare notes on SPV infrastructure, I'm here. [Company]'s sweet spot is cross-border European deals with tailored legal structures, so if that's ever relevant, give me a shout.

KEY OBSERVATIONS from this playbook:
- Each sequence maps to a specific lead list / audience segment, NOT to a length
- Connection request is BLANK for cold audiences, A/B tested (blank vs note) for warmer ones
- A/B/C variants test meaningfully different approaches (question-led vs social proof vs trend-led)
- Each variant set has a "What we're testing" annotation explaining the hypothesis
- The sequence length and aggressiveness are determined by audience warmth
- Follow-up and breakup can be variant-specific when different ICP angles are being tested
`.trim();
