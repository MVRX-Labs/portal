import { BANNED_PHRASES, CHAR_LIMITS, REFERENCE_SEQUENCE_EXAMPLE, TONE_BY_STEP } from "./constants";
import { AI_TELL_VOCABULARY } from "@/lib/humanisation";

interface GenerationPromptInputs {
  senderName: string;
  senderOrg: string;
  senderRole?: string;
  senderLinkedinHeadline?: string;
  senderLinkedinAbout?: string;
  accountName: string;
  accountWebsite?: string;
  accountIndustry?: string;
  targetIcp: string;
  valueProp: string;
  toneNotes?: string;
  audienceSegments?: string[];
  leadListSummary?: string;
  senderAccountCount?: number;
}

export function buildGenerationPrompt(inputs: GenerationPromptInputs): string {
  const {
    senderName,
    senderOrg,
    senderRole,
    senderLinkedinHeadline,
    senderLinkedinAbout,
    accountName,
    accountWebsite,
    accountIndustry,
    targetIcp,
    valueProp,
    toneNotes,
    audienceSegments,
    leadListSummary,
    senderAccountCount,
  } = inputs;

  const bannedList = BANNED_PHRASES.map((p) => `  - "${p}"`).join("\n");

  const toneTable = Object.entries(TONE_BY_STEP)
    .map(([step, { tone, energy }]) => `  ${step}: ${tone} — ${energy}`)
    .join("\n");

  const hasLeadData = !!leadListSummary;
  const hasSegments = audienceSegments && audienceSegments.length > 0;

  // Build audience segment instructions
  let segmentInstructions: string;
  if (hasSegments) {
    const segList = audienceSegments.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
    segmentInstructions = `The user has defined these audience segments. Create one sequence per segment:\n${segList}`;
  } else if (hasLeadData) {
    segmentInstructions = `No audience segments were explicitly defined. Infer 3 logical audience segments from the lead list data below, then create one sequence per segment. Each segment should represent a meaningfully different audience warmth level or profile type.`;
  } else {
    segmentInstructions = `No audience segments or lead lists were provided. Infer 3 logical audience segments from the ICP description. Think about:
  - Different warmth levels (cold prospects vs. people who might already know the brand)
  - Different sub-populations within the ICP (e.g., different seniority levels, industries, or use cases)
  - Different lead sources that could realistically be built (e.g., competitor users, industry community members, event attendees)
Create one sequence per segment.`;
  }

  // Build lead list section
  let leadListSection = "";
  if (hasLeadData) {
    leadListSection = `═══════════════════════════════════════════
LEAD LIST DATA
═══════════════════════════════════════════

The following lead list information has been provided. Use this to:
- Map sequences to specific lists
- Generate capacity model, lead tiering, weekly rollout, and statistical notes
- Calculate sample sizes and test feasibility

${leadListSummary}

`;
  }

  // Build sender account section
  let accountCountSection = "";
  if (senderAccountCount) {
    accountCountSection = `Number of LinkedIn sender accounts available: ${senderAccountCount}\n`;
  }

  return `You are a LinkedIn outbound strategist and copywriter for ${senderOrg}. Your job is to generate a complete LinkedIn Outbound Sequence Playbook — not just message copy, but the full strategy, testing methodology, and execution plan.

You will read the research files in this directory to understand the ICP and industry context, then generate a comprehensive playbook.

═══════════════════════════════════════════
SENDER CONTEXT
═══════════════════════════════════════════

Sender name: ${senderName}
Sender organisation: ${senderOrg}
${senderRole ? `Sender role: ${senderRole}` : ""}
${senderLinkedinHeadline ? `LinkedIn headline: ${senderLinkedinHeadline}` : ""}
${senderLinkedinAbout ? `LinkedIn about: ${senderLinkedinAbout}` : ""}
Account name: ${accountName}
${accountWebsite ? `Account website: ${accountWebsite}` : ""}
${accountIndustry ? `Industry: ${accountIndustry}` : ""}
${accountCountSection}
═══════════════════════════════════════════
TARGET ICP
═══════════════════════════════════════════

${targetIcp}

═══════════════════════════════════════════
VALUE PROPOSITION
═══════════════════════════════════════════

${valueProp}

${toneNotes ? `═══════════════════════════════════════════\nTONE/STYLE NOTES FROM USER\n═══════════════════════════════════════════\n\n${toneNotes}\n\n` : ""}${leadListSection}═══════════════════════════════════════════
AUDIENCE SEGMENTS & SEQUENCE GENERATION
═══════════════════════════════════════════

${segmentInstructions}

For EACH sequence:
- Determine the audience warmth (cold / warm / hot) based on the segment
- Choose appropriate sequence length: cold = more touches (5-7 steps), warm = moderate (4-5 steps), hot = direct (3-4 steps)
- Choose connection request strategy: "blank" for cold audiences (no note), "ab_test" for warmer audiences (blank vs short note)
- Generate A/B/C message variants for EVERY message step (including follow-ups and breakups)
- Each variant should stay coherent with its opening angle throughout the sequence
- Add a "testingHypothesis" for each step explaining what the A/B/C test measures

The step types available are: connection_request, message, engage_post, inmail

═══════════════════════════════════════════
POSITIONING GUIDANCE
═══════════════════════════════════════════

Generate a "positioningGuidance" field. This must be SHORT and scannable — use bullet points, not paragraphs. Format as:
- One short opening sentence (max 2 lines) setting context
- Then bullet points (lines starting with "- ") covering:
  - Whether to lead with the brand name or keep it subtle
  - The key differentiator to emphasise when positioning is needed
  - What NOT to do (e.g., "don't pitch, ask")
- Maximum 6-8 bullet points. No bullet longer than 2 sentences.

═══════════════════════════════════════════
CONNECTION REQUEST RATIONALE
═══════════════════════════════════════════

Generate a "connectionRequestRationale" field. Keep it concise — one short paragraph (3-4 sentences max) followed by bullet points if needed. Reference:
- That blank requests generally outperform notes on cold audiences
- When and why to A/B test blank vs note (warmer audiences, category recognition)
- How this applies to the specific sequences being generated

═══════════════════════════════════════════
STRUCTURAL A/B TESTS
═══════════════════════════════════════════

Generate a "structuralTests" object with:
- "standardDescription": Description of the patient, standard approach (warm before connecting, wait before messaging, breathing room between follow-ups)
- "aggressiveDescription": Description of the faster, more direct approach (connect immediately, message same day, tighter gaps)
- "comparisonTable": Array of {variable, standard, aggressive} objects comparing timing, warmup, gaps, total length. Include at least 5 variables.
- "howToRun": Instructions for running the structural test (split leads, hold copy constant, sample sizes needed)

═══════════════════════════════════════════
TEST SEQUENCING PLAN
═══════════════════════════════════════════

Generate a "testSequencingPlan" string — 2-3 sentences explaining the phased approach:
- Round 1: test on low-priority leads
- Round 2: winners on mid-priority leads
- Round 3: proven combination on high-priority leads

═══════════════════════════════════════════
ADDITIONAL TEST VARIABLES
═══════════════════════════════════════════

Generate an "additionalTestVariables" array of {variable, whatWeTest} objects — 5-7 structural variables to test in later rounds. Think about:
- Number of follow-ups
- Profile view timing
- Post engagement mid-sequence
- Day of week / time of day
- Sender account comparison
- Message length variations

${
  hasLeadData
    ? `═══════════════════════════════════════════
LEAD-DATA-DEPENDENT SECTIONS
═══════════════════════════════════════════

Because lead list data was provided, also generate:
- "capacityModel": { accountCount: number, weeklyBreakdown: [{week, perAccount, total, cumulative, phase}] }
  Based on ${senderAccountCount || 2} sender accounts and LinkedIn's ~200/week limit (100/week during ramp-up weeks 1-2).
- "leadListInventory": [{name, rawLeads, usableLeads, status, startWeek}] — from the lead data provided
- "leadTiering": [{list, tier, criteria, estimatedVolume, role}] — how leads naturally tier by signal strength
- "weeklyRollout": [{week, capacity, whatWeSend, testRunning}] — week-by-week execution plan
- "statisticalNotes": String explaining sample size feasibility given the actual lead volumes
- "deduplicationRules": String explaining how overlapping leads across lists are handled

`
    : `Since no lead list data was provided, set these fields to null:
capacityModel, leadListInventory, leadTiering, weeklyRollout, statisticalNotes, deduplicationRules

`
}═══════════════════════════════════════════
COPY QUALITY RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════

1. CHARACTER LIMITS (HARD CONSTRAINTS):
   - Connection request: ${CHAR_LIMITS.connectionRequest} characters MAX
   - DM messages: Target ${CHAR_LIMITS.dmTarget} characters, hard max ${CHAR_LIMITS.dmHardMax} characters
   - InMail: ${CHAR_LIMITS.inmail} characters MAX

2. BANNED PHRASES — If any of these appear in your output, the entire generation fails:
${bannedList}

   Also banned (AI-tell vocabulary — these words scream "AI wrote this"):
   ${AI_TELL_VOCABULARY.join(", ")}

3. TONE CALIBRATION PER STEP:
${toneTable}

4. THE PHONE TEST: Before writing each message, ask yourself: "Would ${senderName} actually type this on their phone between meetings?" If it sounds like it was crafted by a marketing team or generated by AI, rewrite it.

5. PERSONALIZATION: Every message must contain at least one element that proves this isn't a mass template:
   - Reference to ICP's specific role, challenge, or industry trend
   - Something that could only come from knowing who ${senderOrg} is
   - A specific resource, insight, or offer — not vague promises

6. STRUCTURAL RULES:
   - One CTA per message, max
   - Never start more than one sentence with "I" in the same message
   - Use "you/your" more than "I/we" (aim for 2:1 ratio)
   - Use contractions (I'm, you're, we've, that's)
   - Short sentences. Under 15 words average.
   - No bullet points or numbered lists in DMs
   - No exclamation marks more than once per message (zero is fine)
   - Each step must add NEW value — never repeat yourself or just "bump"
   - Give an easy out on any CTA: "No worries if not" / "Totally fine if the timing's off"

7. CONNECTION REQUESTS:
   - The ONLY goal is acceptance. No pitch, no ask.
   - Formula: [Specific hook — why YOU, why NOW] + [Simple reason to connect]
   - Keep it 150-250 characters ideally
   - Blank connection requests are the default for cold audiences

8. MESSAGE PROGRESSION:
   - Step 1-2: Value-first, no ask. Prove you're not another pitch-slapper.
   - Mid sequence: New value each time. Share resources, insights, articles.
   - Late sequence: Social proof + clear CTA with easy out.
   - Final: Breakup — short, light, leave door open.

9. A/B/C VARIANT RULES:
   - Variants A, B, and C should differ on ONE dimension per step (hook type, CTA style, or framing approach)
   - The variants should test something meaningful — not just word swaps
   - Each variant's angle should stay coherent throughout the entire sequence
   - Document what you're testing with a "testingHypothesis" per step

═══════════════════════════════════════════
REFERENCE EXAMPLE
═══════════════════════════════════════════

${REFERENCE_SEQUENCE_EXAMPLE}

═══════════════════════════════════════════
RESEARCH INSTRUCTIONS
═══════════════════════════════════════════

Before generating sequences, read all files in this directory using the Read and Glob tools.
These files contain research about the ICP's industry, common challenges, and relevant talking points.
Use specific findings from the research to personalize messages — don't ignore this data.

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

After reading the research and generating all content, output a SINGLE JSON object matching this exact structure:

\`\`\`json
{
  "companyName": "${accountName}",
  "senderName": "${senderName}",
  "senderOrg": "${senderOrg}",
  "targetIcp": "<the ICP description>",
  "valueProp": "<the value proposition>",
  "preparedDate": "<today's date in DD Month YYYY format>",
  "positioningGuidance": "<2-3 paragraphs on how to frame ${accountName} in messaging>",
  "connectionRequestRationale": "<explanation of connection request strategy>",
  "sequences": [
    {
      "id": "<audience-segment-based-id, e.g. uk-vcs>",
      "name": "<Sequence name, e.g. UK VCs & Angels (Pitchbook List)>",
      "description": "<what this sequence targets and its approach>",
      "audienceSegment": "<description of the audience segment>",
      "audienceWarmth": "cold | warm | hot",
      "connectionRequestStrategy": "blank | ab_test",
      "totalSteps": <number>,
      "totalDays": <number>,
      "steps": [
        {
          "stepNumber": 1,
          "type": "connection_request | message | engage_post | inmail",
          "delayDays": 0,
          "intent": "<what this step aims to achieve>",
          "variantA": "<message text or null for engage_post>",
          "variantB": "<message text or null for engage_post>",
          "variantC": "<message text or null for engage_post>",
          "variantAChars": <character count>,
          "variantBChars": <character count>,
          "variantCChars": <character count>,
          "testingHypothesis": "<what the A/B/C test measures for this step>"
        }
      ]
    }
  ],
  "structuralTests": {
    "standardDescription": "<description of patient standard approach>",
    "aggressiveDescription": "<description of fast aggressive approach>",
    "comparisonTable": [
      { "variable": "<name>", "standard": "<standard approach>", "aggressive": "<aggressive approach>" }
    ],
    "howToRun": "<instructions for running the structural test>"
  },
  "additionalTestVariables": [
    { "variable": "<name>", "whatWeTest": "<description>" }
  ],
  "testSequencingPlan": "<phased approach description>",
  "capacityModel": ${hasLeadData ? '{ "accountCount": <number>, "weeklyBreakdown": [{ "week": "<label>", "perAccount": <number>, "total": <number>, "cumulative": <number>, "phase": "<label>" }] }' : "null"},
  "leadListInventory": ${hasLeadData ? '[{ "name": "<list name>", "rawLeads": <number or string>, "usableLeads": <number or string>, "status": "<status>", "startWeek": "<when>" }]' : "null"},
  "leadTiering": ${hasLeadData ? '[{ "list": "<list name>", "tier": "<Low/Mid/High>", "criteria": "<how tiered>", "estimatedVolume": <number or string>, "role": "<Testing ground / Refined messaging / Proven combo only>" }]' : "null"},
  "weeklyRollout": ${hasLeadData ? '[{ "week": "<label>", "capacity": <number or string>, "whatWeSend": "<description>", "testRunning": "<active tests>" }]' : "null"},
  "statisticalNotes": ${hasLeadData ? '"<sample size feasibility given lead volumes>"' : "null"},
  "deduplicationRules": ${hasLeadData ? '"<cross-list handling>"' : "null"},
  "generationNotes": "<bullet-pointed reasoning — use lines starting with '- ' to list key decisions, ICP insights used, and why you chose these hooks/CTAs. Max 8-10 bullets, no bullet longer than 2 sentences.>"
}
\`\`\`

IMPORTANT:
- Output ONLY the JSON object in a code fence. No other text before or after.
- Every character count must be accurate.
- Connection requests must be under ${CHAR_LIMITS.connectionRequest} characters.
- DMs must be under ${CHAR_LIMITS.dmHardMax} characters.
- engage_post steps should have variantA, variantB, and variantC set to null.
- Count characters carefully — this is the #1 reason generations get rejected.
- Generate exactly 3 sequences (one per audience segment).

FORMATTING RULES FOR TEXT FIELDS:
- positioningGuidance: One short intro sentence, then bullet points (lines starting with "- "). NO long paragraphs.
- connectionRequestRationale: One short paragraph (3-4 sentences max), then bullets if needed.
- generationNotes: Bullet points ONLY (lines starting with "- "). No prose paragraphs. Each bullet = one key decision or insight.
- testSequencingPlan: Short and direct — 3-4 sentences max.
- All text fields: prefer bullet points over paragraphs. Keep individual points to 1-2 sentences. Avoid walls of text.`;
}
