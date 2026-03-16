/**
 * Lead enrichment stubs.
 *
 * These will be replaced with real implementations once we integrate
 * Apollo (for email/phone) and build out the AI scoring pipeline.
 */

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

export interface LeadScoringResult {
  tier: 1 | 2 | 3;
  conversionPct: number;
  rationale: string;
}

/**
 * Stub: score a lead against an ICP definition using AI.
 * Returns a default tier-3 result until the AI scoring pipeline is built.
 */
export async function scoreLeadAgainstIcp(
  _lead: {
    firstName: string;
    lastName: string | null;
    headline: string | null;
    company: string | null;
    title: string | null;
    division: string | null;
    engagementTypes: string[];
    engagementPosts: string[];
  },
  _icpDefinition: {
    name: string;
    description: string;
    targetTitles: string[];
    targetIndustries: string[];
    targetCompanySizes: string[];
    targetSignals: string[];
  }
): Promise<LeadScoringResult> {
  // TODO: Implement AI scoring pipeline
  // 1. Use Claude to assess ICP fit based on headline, company, title vs ICP definition
  // 2. Factor in engagement signals (comment > repost > reaction, multi-post > single)
  // 3. Return tier (1=highest priority, 3=lowest) + conversion % + rationale
  return {
    tier: 3,
    conversionPct: 0,
    rationale: "Scoring not yet available — enrichment pipeline pending.",
  };
}
