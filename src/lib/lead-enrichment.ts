/**
 * Lead enrichment & ICP scoring.
 *
 * - enrichLeadContact: stub until Apollo API is integrated
 * - scoreLeadsBatch: scores leads against ICP definitions using Claude
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Contact enrichment (still stubbed — no Apollo API key configured)
// ---------------------------------------------------------------------------

export interface ContactEnrichmentResult {
  email: string | null;
  phone: string | null;
  region: string | null;
}

/**
 * Stub: look up email/phone/region for a lead via Apollo or similar enrichment provider.
 * Returns null fields until an enrichment API is integrated.
 */
export async function enrichLeadContact(_linkedinUrl: string): Promise<ContactEnrichmentResult> {
  // TODO: Integrate Apollo API
  // - POST https://api.apollo.io/v1/people/match
  // - Match by linkedin_url
  // - Returns email, phone, city/state/country
  return { email: null, phone: null, region: null };
}

// ---------------------------------------------------------------------------
// ICP scoring
// ---------------------------------------------------------------------------

export interface LeadScoringResult {
  tier: 1 | 2 | 3;
  rationale: string;
}

interface LeadForScoring {
  id: string;
  firstName: string;
  lastName: string | null;
  headline: string | null;
  company: string | null;
  title: string | null;
  division: string | null;
  engagementTypes: string[];
  engagementPostCount: number;
}

interface IcpDefinitionForScoring {
  name: string;
  description: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetCompanySizes: string[];
  targetSignals: string[];
}

// Sonnet 4.6 pricing as of 2026-03
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const anthropic = new Anthropic();

function buildScoringPrompt(leads: LeadForScoring[], icpDefinitions: IcpDefinitionForScoring[]): string {
  const icpBlock = icpDefinitions
    .map(
      (icp, i) =>
        `### ICP ${i + 1}: ${icp.name}\n` +
        `Description: ${icp.description}\n` +
        `Target titles: ${icp.targetTitles.join(", ") || "not specified"}\n` +
        `Target industries: ${icp.targetIndustries.join(", ") || "not specified"}\n` +
        `Target company sizes: ${icp.targetCompanySizes.join(", ") || "not specified"}\n` +
        `Target signals: ${icp.targetSignals.join(", ") || "not specified"}`
    )
    .join("\n\n");

  const leadsData = leads.map((l) => ({
    id: l.id,
    name: [l.firstName, l.lastName].filter(Boolean).join(" "),
    headline: l.headline || "",
    company: l.company || "",
    title: l.title || "",
    division: l.division || "",
    engagementTypes: l.engagementTypes,
    engagementPostCount: l.engagementPostCount,
  }));

  return `You are an ICP (Ideal Customer Profile) scoring specialist. Evaluate each lead against the ICP definitions below and assign the BEST-FIT score.

## ICP Definitions

${icpBlock}

## Scoring Rules

- **Tier 1 (Hot):** Strong alignment — title/role matches target titles, company or industry matches, engagement signals are strong (commented on multiple posts, or commented + reacted).
- **Tier 2 (Warm):** Partial alignment — some title/industry overlap, OR strong engagement signals compensate for weaker profile match.
- **Tier 3 (Cold):** Weak alignment — little overlap with any ICP, minimal engagement.

## Engagement Signal Strength (strongest to weakest)

- Comment on multiple posts > Comment on one post > Repost > Reaction
- Engaging with more posts = stronger buying signal

Evaluate each lead against ALL ICPs and use the BEST fit.
If information is incomplete, make a best-effort assessment and note uncertainty in the rationale.

## Leads

${JSON.stringify(leadsData, null, 2)}

Return a JSON array. For each lead: { "id": "<lead id>", "tier": 1|2|3, "rationale": "<1-2 sentence explanation>" }
Return ONLY the JSON array, no other text.`;
}

/**
 * Score a batch of leads against multiple ICP definitions using Claude.
 * Returns a map of leadId -> scoring result, plus the API cost.
 */
export async function scoreLeadsBatch(
  leads: LeadForScoring[],
  icpDefinitions: IcpDefinitionForScoring[]
): Promise<{ results: Map<string, LeadScoringResult>; cost: number }> {
  if (leads.length === 0 || icpDefinitions.length === 0) {
    return { results: new Map(), cost: 0 };
  }

  const prompt = buildScoringPrompt(leads, icpDefinitions);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cost =
    response.usage.input_tokens * INPUT_COST_PER_TOKEN + response.usage.output_tokens * OUTPUT_COST_PER_TOKEN;

  // Extract JSON (fenced code block or bare array)
  let jsonStr = text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    jsonStr = fenced[1];
  } else {
    const bare = text.match(/\[[\s\S]*\]/);
    if (bare) jsonStr = bare[0];
  }

  const parsed: Array<{ id: string; tier: number; rationale: string }> = JSON.parse(jsonStr);

  const results = new Map<string, LeadScoringResult>();
  const leadIds = new Set(leads.map((l) => l.id));

  for (const item of parsed) {
    if (!leadIds.has(item.id)) continue;
    const tier = item.tier as 1 | 2 | 3;
    if (tier < 1 || tier > 3) continue;
    results.set(item.id, {
      tier,
      rationale: item.rationale || "",
    });
  }

  return { results, cost };
}

/**
 * Score a single lead against a single ICP definition.
 * Convenience wrapper around scoreLeadsBatch.
 */
export async function scoreLeadAgainstIcp(
  lead: {
    id: string;
    firstName: string;
    lastName: string | null;
    headline: string | null;
    company: string | null;
    title: string | null;
    division: string | null;
    engagementTypes: string[];
    engagementPosts: string[];
  },
  icpDefinition: IcpDefinitionForScoring
): Promise<LeadScoringResult> {
  const { results } = await scoreLeadsBatch(
    [
      {
        ...lead,
        engagementPostCount: lead.engagementPosts.length,
      },
    ],
    [icpDefinition]
  );

  return (
    results.get(lead.id) ?? {
      tier: 3,
      rationale: "Could not score lead — AI returned no result.",
    }
  );
}
