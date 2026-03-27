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

function buildIcpBlock(account: Account, icp: IcpDefinition): string {
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

  return `Your client is "${account.name}"${account.industry ? ` in the ${account.industry} industry` : ""}${account.website ? ` (${account.website})` : ""}.

They have an Ideal Customer Profile (ICP) defined as follows:

${icpDetails}`;
}

export function buildLinkedInSpecPrompt(account: Account, icp: IcpDefinition): string {
  const targetAudience = icp.targetTitles.length > 0 ? icp.targetTitles.join(", ") : "target buyers";

  return `You are a LinkedIn content strategist working for an agency that produces LinkedIn content for B2B executives.

${buildIcpBlock(account, icp)}

Your task: find LinkedIn "sages" — people who frequently create high-performing posts that would resonate with this ICP. Also identify keyword search queries that would surface top LinkedIn posts relevant to this ICP.

## Instructions

1. Use web search to find LinkedIn creators who:
   - Post content that the ICP audience (${targetAudience}) would find valuable
   - Have a track record of high engagement (likes, comments, reposts)
   - Post at least weekly
   - Create substantive content (thought leadership, how-tos, insights) — not just promotional posts
   - Have 2K+ followers (enough to demonstrate consistent engagement)

2. Search for the top creators in relevant niches. Try searches like:
   - "top LinkedIn creators [industry/niche]"
   - "best LinkedIn posts about [topic]"
   - "LinkedIn influencers [industry]"
   - Look at LinkedIn Top Voices lists for relevant categories

3. For keyword searches, think about what LinkedIn search queries would surface high-performing posts that this ICP would engage with. LinkedIn search is basic — just use natural language phrases. Consider:
   - Industry-specific terms (e.g. "demand generation", "product-led growth")
   - Pain points and challenges the ICP faces
   - Trending topics in the ICP's space
   - Job titles + content themes (e.g. "VP marketing strategy")

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

export function buildTwitterSpecPrompt(account: Account, icp: IcpDefinition): string {
  const targetAudience = icp.targetTitles.length > 0 ? icp.targetTitles.join(", ") : "target buyers";

  return `You are a Twitter/X content strategist working for an agency that monitors social media for B2B executives.

${buildIcpBlock(account, icp)}

Your task: find Twitter/X "sages" — people who frequently create high-performing tweets that would resonate with this ICP (${targetAudience}). Also identify keyword search queries using Twitter's Advanced Search syntax that would surface top tweets relevant to this ICP.

## Sages

Use web search to find Twitter/X creators who:
- Post content relevant to the ICP's interests and challenges
- Have strong engagement (likes, retweets, replies)
- Tweet original content regularly (not just retweets)
- Create threads, insights, hot takes, or tactical advice — not just promotional content
- Are active participants in relevant Twitter communities

Search for top Twitter voices using queries like:
- "best Twitter accounts to follow for [industry/niche]"
- "top Twitter/X voices in [topic]"
- "[industry] Twitter community must-follows"
- "who to follow on X for [topic]"

## Keywords

Twitter keyword searches use Twitter's Advanced Search syntax, which is very different from LinkedIn. The queries should use operators to filter for quality and relevance. Twitter has much more noise than LinkedIn, so engagement filters are essential.

Available operators:
- Hashtags: \`#BuildInPublic\`, \`#SaaS\`
- Engagement filters: \`min_faves:50\`, \`min_retweets:10\`, \`min_replies:5\`
- Noise filters: \`-filter:replies\` (exclude replies), \`-filter:retweets\` (original only)
- Boolean: \`OR\` for alternatives, \`-word\` to exclude
- Language: \`lang:en\`

Example good Twitter keyword searches:
- \`"product-led growth" min_faves:50 -filter:replies\` — topic + quality filter
- \`#PLG OR #ProductLedGrowth min_faves:20 -filter:retweets\` — hashtag search, original only
- \`"cold email" OR "outbound sales" min_faves:100 -filter:replies\` — boolean with engagement
- \`"customer success" churn min_faves:30 -filter:retweets -filter:replies\` — niche topic, low noise

Design Twitter keyword queries that:
1. Use relevant hashtags that the ICP's community uses
2. Include \`min_faves:\` to filter out low-quality tweets (choose threshold based on niche size — smaller niches use lower thresholds)
3. Use \`-filter:replies -filter:retweets\` to get original content
4. Use \`OR\` operators for related terms
5. Target the specific language and terminology used in the ICP's Twitter community

## Output Format

Return ONLY a JSON object with this exact structure (no markdown, no explanation):

{
  "sages": [
    {
      "twitterHandle": "username",
      "displayName": "Full Name",
      "bio": "Their Twitter bio or description",
      "rationale": "Why this person's content resonates with the ICP"
    }
  ],
  "keywords": [
    {
      "query": "the Twitter Advanced Search query string with operators",
      "rationale": "Why this query surfaces relevant high-performing content"
    }
  ]
}

Find 5-8 sages and 3-5 keyword queries. Be specific — use real people you find via web search, not made-up profiles. Every twitterHandle must be a real Twitter/X handle (without the @ prefix).`;
}

/** @deprecated Use buildLinkedInSpecPrompt and buildTwitterSpecPrompt instead */
export const buildSpecGenerationPrompt = buildLinkedInSpecPrompt;
