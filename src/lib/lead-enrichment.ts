/**
 * Lead enrichment: contact lookup stubs + AI-powered ICP scoring.
 */

import { callLLM } from "@/lib/knowledge/normaliser-llm";

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
  return { email: null, phone: null, region: null };
}

export interface LeadScoringResult {
  tier: 1 | 2 | 3;
  conversionPct: number;
  rationale: string;
  cost: number;
}

interface LeadForScoring {
  firstName: string;
  lastName: string | null;
  headline: string | null;
  company: string | null;
  title: string | null;
  division: string | null;
  engagementTypes: string[];
  engagementPosts: string[];
}

interface IcpForScoring {
  name: string;
  description: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetCompanySizes: string[];
  targetSignals: string[];
}

/**
 * Score a lead against an ICP definition using Claude.
 *
 * Engagement signal weighting:
 *   comment > repost > reaction
 *   repeat engagers (multi-post) > one-time engagers
 */
export async function scoreLeadAgainstIcp(
  lead: LeadForScoring,
  icpDefinition: IcpForScoring,
  logger: { info: (msg: string) => void; error: (msg: string) => void }
): Promise<LeadScoringResult> {
  const engagementSummary = buildEngagementSummary(lead.engagementTypes, lead.engagementPosts);

  const prompt = `You are an expert B2B lead qualification analyst. Score this lead against the Ideal Customer Profile (ICP).

## Lead Profile
- Name: ${lead.firstName} ${lead.lastName || ""}
- Headline: ${lead.headline || "Unknown"}
- Company: ${lead.company || "Unknown"}
- Title: ${lead.title || "Unknown"}
- Division: ${lead.division || "Unknown"}
${engagementSummary}

## ICP Definition: "${icpDefinition.name}"
- Description: ${icpDefinition.description}
- Target Titles: ${icpDefinition.targetTitles.length > 0 ? icpDefinition.targetTitles.join(", ") : "Not specified"}
- Target Industries: ${icpDefinition.targetIndustries.length > 0 ? icpDefinition.targetIndustries.join(", ") : "Not specified"}
- Target Company Sizes: ${icpDefinition.targetCompanySizes.length > 0 ? icpDefinition.targetCompanySizes.join(", ") : "Not specified"}
- Target Signals: ${icpDefinition.targetSignals.length > 0 ? icpDefinition.targetSignals.join(", ") : "Not specified"}

## Scoring Rules
1. Assess ICP fit: How well does the lead's title, company, industry, and division match the ICP?
2. Engagement signal strength matters:
   - comment is the strongest signal (active interest)
   - repost is medium (endorsement)
   - reaction is weakest (passive interest)
   - Engaging on multiple posts is stronger than a single engagement
3. Assign a tier:
   - Tier 1: Strong ICP match AND strong engagement signals — high-priority prospect
   - Tier 2: Partial ICP match OR moderate engagement — worth pursuing
   - Tier 3: Weak ICP match AND weak engagement — low priority
4. Estimate conversionPct (0-100): likelihood this lead converts to a customer

Respond ONLY with valid JSON, no markdown fencing:
{"tier": 1|2|3, "conversionPct": 0-100, "rationale": "One sentence explaining the score"}`;

  const { output, cost } = await callLLM(prompt, logger);
  const parsed = parseScoreResponse(output);
  return { ...parsed, cost };
}

function buildEngagementSummary(engagementTypes: string[], engagementPosts: string[]): string {
  const typeCounts: Record<string, number> = {};
  for (const t of engagementTypes) {
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const typeStr = Object.entries(typeCounts)
    .map(([type, count]) => (count > 1 ? `${type} (x${count})` : type))
    .join(", ");

  const postCount = engagementPosts.length;
  const repeatLabel = postCount > 1 ? `repeat engager across ${postCount} posts` : "single-post engager";

  return `## Engagement Signals
- Types: ${typeStr || "None"}
- Post count: ${postCount} (${repeatLabel})`;
}

function parseScoreResponse(raw: string): { tier: 1 | 2 | 3; conversionPct: number; rationale: string } {
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const tier = [1, 2, 3].includes(parsed.tier) ? (parsed.tier as 1 | 2 | 3) : 3;
    const conversionPct = Math.max(0, Math.min(100, Math.round(Number(parsed.conversionPct) || 0)));
    const rationale =
      typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : "Unable to parse rationale.";
    return { tier, conversionPct, rationale };
  } catch {
    return { tier: 3, conversionPct: 0, rationale: "Scoring failed — could not parse AI response." };
  }
}
