/**
 * TypeScript types for HeyReach outbound sequence generation.
 *
 * The generator produces 3 sequence structures (full/medium/short)
 * each with 2 A/B content variants.
 */

export type TouchpointType = "connection_request" | "message" | "engage_post" | "inmail";

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
  /** Character count for variant A */
  variantAChars?: number;
  /** Character count for variant B */
  variantBChars?: number;
}

export interface Sequence {
  id: "full" | "medium" | "short";
  name: string;
  description: string;
  /** Total steps in the sequence */
  totalSteps: number;
  /** Total duration in days */
  totalDays: number;
  steps: SequenceStep[];
}

export interface OutboundSequenceContent {
  /** Company being targeted */
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

  /** The 3 sequence structures */
  sequences: [Sequence, Sequence, Sequence];

  /** Summary of what differentiates the A/B variants */
  variantStrategy: {
    variantALabel: string;
    variantADescription: string;
    variantBLabel: string;
    variantBDescription: string;
  };

  /** Notes/reasoning from the AI about its approach */
  generationNotes: string;
}
