interface IcpDefinition {
  name: string;
  description: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetCompanySizes: string[];
  targetSignals: string[];
}

interface Account {
  name: string;
  industry?: string | null;
  website?: string | null;
}

export function buildSpecGenerationPrompt(account: Account, icp: IcpDefinition): string {
  const icpDetails = [
    `ICP Name: ${icp.name}`,
    `Description: ${icp.description}`,
    icp.targetTitles.length > 0 ? `Target Titles: ${icp.targetTitles.join(", ")}` : null,
    icp.targetIndustries.length > 0 ? `Target Industries: ${icp.targetIndustries.join(", ")}` : null,
    icp.targetCompanySizes.length > 0 ? `Target Company Sizes: ${icp.targetCompanySizes.join(", ")}` : null,
    icp.targetSignals.length > 0 ? `Target Signals: ${icp.targetSignals.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a LinkedIn content strategist working for an agency that produces LinkedIn content for B2B executives.

Your client is "${account.name}"${account.industry ? ` in the ${account.industry} industry` : ""}${account.website ? ` (${account.website})` : ""}.

They have an Ideal Customer Profile (ICP) defined as follows:

${icpDetails}

Your task: find LinkedIn "sages" — people who frequently create high-performing posts that would resonate with this ICP. Also identify keyword search queries that would surface top LinkedIn posts relevant to this ICP.

## Instructions

1. Use web search to find LinkedIn creators who:
   - Post content that the ICP audience (${icp.targetTitles.length > 0 ? icp.targetTitles.join(", ") : "target buyers"}) would find valuable
   - Have a track record of high engagement (likes, comments, reposts)
   - Post at least weekly
   - Create substantive content (thought leadership, how-tos, insights) — not just promotional posts
   - Have 2K+ followers (enough to demonstrate consistent engagement)

2. Search for the top creators in relevant niches. Try searches like:
   - "top LinkedIn creators [industry/niche]"
   - "best LinkedIn posts about [topic]"
   - "LinkedIn influencers [industry]"
   - Look at LinkedIn Top Voices lists for relevant categories

3. For keyword searches, think about what LinkedIn search queries would surface high-performing posts that this ICP would engage with. Consider:
   - Industry-specific terms
   - Pain points and challenges the ICP faces
   - Trending topics in the ICP's space
   - Job titles + content themes

## Output Format

Return ONLY a JSON object with this exact structure (no markdown, no explanation):

{
  "sages": [
    {
      "linkedinUrl": "https://www.linkedin.com/in/username",
      "displayName": "Full Name",
      "headline": "Their LinkedIn headline",
      "rationale": "Why this person's content resonates with the ICP"
    }
  ],
  "keywords": [
    {
      "query": "the search query string",
      "rationale": "Why this query surfaces relevant high-performing content"
    }
  ]
}

Find 5-8 sages and 3-5 keyword queries. Be specific — use real people you find via web search, not made-up profiles. Every linkedinUrl must be a real LinkedIn profile URL.`;
}
