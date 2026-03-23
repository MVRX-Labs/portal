import { BANNED_PHRASES, CHAR_LIMITS } from "./constants";
import { AI_TELL_VOCABULARY } from "@/lib/humanisation";

export function buildReviewPrompt(senderName: string): string {
  const bannedList = BANNED_PHRASES.map((p) => `  - "${p}"`).join("\n");

  return `You are a quality reviewer for a LinkedIn Outbound Sequence Playbook. Your job is to read the generated playbook in report.json and fix any issues.

Read report.json using the Read tool, then perform ALL of the following checks.

═══════════════════════════════════════════
REVIEW CHECKLIST
═══════════════════════════════════════════

1. CHARACTER LIMIT ENFORCEMENT
   For every step in every sequence, verify the character counts are accurate. Recount them yourself.
   - Connection requests: MUST be under ${CHAR_LIMITS.connectionRequest} characters. If over, rewrite shorter.
   - DM messages: Target ${CHAR_LIMITS.dmTarget}, hard max ${CHAR_LIMITS.dmHardMax}. If over, trim.
   - Update variantAChars / variantBChars / variantCChars with your verified counts.
   - All three variants (A, B, C) must be checked.

2. BANNED PHRASE SCAN
   Check every message for these phrases (case-insensitive). If found, rewrite the sentence:
${bannedList}

   Also check for:
   - AI-tell vocabulary (these words scream "AI wrote this"): ${AI_TELL_VOCABULARY.join(", ")}
   - Corporate buzzwords: optimize, synergy, seamless, empower, ecosystem
   - AI-sounding patterns: "I noticed that...", "I'd be happy to...", "Would love to explore..."
   - Starting 2+ sentences with "I" in the same message
   - Exclamation marks appearing more than once in any message

3. PHONE TEST
   Read each message and ask: "Would ${senderName} actually type this on their phone?"
   Red flags:
   - Perfect parallel structure (real messages are slightly messy)
   - Marketing-speak or newsletter tone
   - Messages that could be sent to 10,000 people identically
   - Em dashes used more than once in a message
   - Bullet points or numbered lists in DMs
   If a message fails the phone test, rewrite it to sound more human.

4. VARIANT DIFFERENTIATION
   Variants A, B, and C should be meaningfully different, not just word swaps.
   They should test a clear hypothesis (e.g., question-led vs. observation-led vs. direct).
   If variants are too similar, rewrite one to create a real test.
   Each testingHypothesis should clearly explain what's being tested.

5. VARIANT COHERENCE
   Each variant's angle should stay coherent through the entire sequence.
   If variant A opens with a question-led approach, the follow-ups and breakup for A should maintain that angle.
   Check that follow-up and breakup variants don't contradict their opening message's tone or approach.

6. PROGRESSION CHECK
   Within each sequence:
   - Early steps should be value-first with no/minimal ask
   - Each step must add something NEW (no repetition of the same pitch)
   - CTAs should escalate gradually (soft → medium → clear)
   - The breakup should be light and leave the door open
   - No step should pitch before its intended purpose

7. PERSONALIZATION CHECK
   Every message step should contain at least one element that:
   - References the ICP's specific world (role, challenges, industry)
   - Could only come from ${senderName}'s perspective
   - Proves this isn't a mass-blast template

8. CONNECTION REQUEST QUALITY
   - Is the ONLY goal acceptance? (No hidden pitch or ask)
   - Does it have a specific hook? (Why this person, why now)
   - Is it 150-250 characters? (Not too short, not hitting the limit)
   - For sequences with connectionRequestStrategy "blank": variants should have null or blank connection request content
   - For sequences with connectionRequestStrategy "ab_test": one variant should be blank/null, others should have short notes

9. AUDIENCE WARMTH ALIGNMENT
   - Cold audiences: longer sequences, more value-first steps, blank connection requests
   - Warm audiences: moderate length, can reference shared context, may A/B test connection notes
   - Hot audiences: shorter, more direct, can name-drop relevant context earlier
   Verify each sequence's structure matches its audienceWarmth.

10. POSITIONING GUIDANCE CHECK
    - positioningGuidance should be concrete and specific to this client/ICP
    - It should NOT be generic advice that applies to any company
    - connectionRequestRationale should reference the specific sequences and their strategies

11. STRATEGIC SECTIONS
    - structuralTests.comparisonTable should have at least 5 variables
    - additionalTestVariables should have at least 5 entries
    - testSequencingPlan should mention all 3 rounds
    - If lead data sections are present (non-null), verify they reference real data from the generation

12. CONSISTENCY
    - senderName, senderOrg, targetIcp should match across all sequences
    - Step numbering should be sequential within each sequence
    - totalSteps and totalDays should match the actual steps array
    - engage_post steps should have null messages for all three variants
    - Sequence IDs should be unique, lowercase, kebab-case

═══════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════

Output the COMPLETE corrected JSON object in a code fence.
Include ALL fields, sequences, and steps, even those you didn't change.
Do not add commentary outside the JSON code fence.

If the original was already high quality, return it with only character count corrections.
Do not over-edit — preserve the original voice and personality. Only fix genuine issues.`;
}
