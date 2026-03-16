/**
 * TypeScript types for HeyReach outbound sequence playbook generation.
 *
 * The generator produces sequences per audience segment,
 * each with 3 A/B/C content variants.
 */

export type TouchpointType = "connection_request" | "message" | "engage_post" | "inmail";

export type AudienceWarmth = "cold" | "warm" | "hot";

export interface SequenceStep {
  stepNumber: number;
  type: TouchpointType;
  /** Days after previous step (0 for first step) */
  delayDays: number;
  /** Purpose of this step — not shown to prospect, used for internal clarity */
  intent: string;
  /** Message content for variant A (null for engage_post steps) */
  variantA: string | null;
  /** Message content for variant B (null for engage_post steps) */
  variantB: string | null;
  /** Message content for variant C (null for engage_post steps) */
  variantC: string | null;
  /** Character count for variant A */
  variantAChars?: number;
  /** Character count for variant B */
  variantBChars?: number;
  /** Character count for variant C */
  variantCChars?: number;
  /** What the A/B/C test measures for this step */
  testingHypothesis?: string;
}

export interface Sequence {
  /** Audience-segment-based ID (e.g. "uk-vcs", "competitor-leads") */
  id: string;
  name: string;
  description: string;
  /** The audience segment this sequence targets */
  audienceSegment: string;
  /** How warm this audience is — drives sequence length and tone */
  audienceWarmth: AudienceWarmth;
  /** Connection request strategy: "blank" (no note) or "ab_test" (blank vs note) */
  connectionRequestStrategy: "blank" | "ab_test";
  /** Total steps in the sequence */
  totalSteps: number;
  /** Total duration in days */
  totalDays: number;
  steps: SequenceStep[];
}

// ─── Strategic Sections ─────────────────────────────────────

export interface StructuralTestConfig {
  standardDescription: string;
  aggressiveDescription: string;
  comparisonTable: { variable: string; standard: string; aggressive: string }[];
  howToRun: string;
}

export interface TestVariable {
  variable: string;
  whatWeTest: string;
}

export interface CapacityModel {
  accountCount: number;
  weeklyBreakdown: {
    week: string;
    perAccount: number;
    total: number;
    cumulative: number;
    phase: string;
  }[];
}

export interface LeadList {
  name: string;
  rawLeads: number | string;
  usableLeads: number | string;
  status: string;
  startWeek: string;
}

export interface LeadTier {
  list: string;
  tier: string;
  criteria: string;
  estimatedVolume: number | string;
  role: string;
}

export interface WeeklyRolloutEntry {
  week: string;
  capacity: number | string;
  whatWeSend: string;
  testRunning: string;
}

// ─── Top-Level Content ──────────────────────────────────────

export interface OutboundSequenceContent {
  /** Company/client being targeted */
  companyName: string;
  /** Sender's name */
  senderName: string;
  /** Sender's company/org */
  senderOrg: string;
  /** ICP description */
  targetIcp: string;
  /** Value proposition used */
  valueProp: string;
  /** Date generated */
  preparedDate: string;

  /** How to frame the client in messaging */
  positioningGuidance: string;
  /** Why blank connection requests vs notes */
  connectionRequestRationale: string;

  /** Sequences per audience segment */
  sequences: Sequence[];

  /** Structural A/B test configuration */
  structuralTests: StructuralTestConfig;
  /** Future test ideas */
  additionalTestVariables: TestVariable[];
  /** Round 1/2/3 phased approach */
  testSequencingPlan: string;

  /** Capacity model — null if no lead data */
  capacityModel: CapacityModel | null;
  /** Available lead lists — null if no lead data */
  leadListInventory: LeadList[] | null;
  /** How leads are tiered — null if no lead data */
  leadTiering: LeadTier[] | null;
  /** Week-by-week rollout plan — null if no lead data */
  weeklyRollout: WeeklyRolloutEntry[] | null;
  /** Sample size / significance context — null if no lead data */
  statisticalNotes: string | null;
  /** Cross-list deduplication rules — null if no lead data */
  deduplicationRules: string | null;

  /** Notes/reasoning from the AI about its approach */
  generationNotes: string;
}
