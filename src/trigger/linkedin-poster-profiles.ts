/**
 * Known poster profiles and organisational context for the LinkedIn post generator.
 *
 * When a poster matches a known profile, extra background is injected so the AI
 * can write with deeper knowledge of who they are, what they care about, and
 * which programmes or initiatives are relevant to their work.
 */

export interface PosterProfile {
  /** Display name (matched case-insensitively against the poster's contact name). */
  name: string;
  /** Short role / title used when the contact record has no role. */
  fallbackRole: string;
  /** LinkedIn profile URL. */
  linkedinUrl: string;
  /** Free-form background paragraph(s) the AI should treat as ground truth. */
  background: string;
  /**
   * Keywords that, when detected in source material, trigger injection of
   * the `relatedContext` blocks below.
   */
  contextKeywords: string[];
}

export interface OrganisationalContext {
  /** A slug used for logging / matching. */
  id: string;
  /** Trigger keywords (matched case-insensitively against source material). */
  keywords: string[];
  /** Context paragraph(s) injected when keywords match. */
  context: string;
}

// ---------------------------------------------------------------------------
// Known poster profiles
// ---------------------------------------------------------------------------

const POSTER_PROFILES: PosterProfile[] = [
  {
    name: "Jack Miller",
    fallbackRole: "Cofounder, MVRX Labs",
    linkedinUrl: "https://www.linkedin.com/in/jack-w-miller/",
    background: `Jack Miller is a cofounder of MVRX Labs, a company that builds AI-powered tools for go-to-market strategy, LinkedIn intelligence, and content generation. He is deeply embedded in the UK and European startup ecosystem and has a particular interest in defence technology, AI safety, and the intersection of national security with frontier AI capabilities.

Jack is closely connected to the Entrepreneur First (EF) network and the def/acc (defensive acceleration) movement. He cares about building technology that protects rather than just disrupts, and his writing tends to sit at the intersection of practical founder experience and broader questions about what technology should be used for.

When writing as Jack, favour a tone that is direct, grounded in specifics, and slightly contrarian. He prefers concrete examples over abstract principles, and he is comfortable expressing uncertainty when genuine. He does not write like a corporate spokesperson; he writes like a founder who has opinions and is not afraid to share them, but backs them up with experience rather than bluster.`,
    contextKeywords: ["mvrx", "def/acc", "defacc", "defensive acceleration", "entrepreneur first", "joinef", "ef cohort"],
  },
];

// ---------------------------------------------------------------------------
// Organisational / programme context
// ---------------------------------------------------------------------------

const ORGANISATIONAL_CONTEXTS: OrganisationalContext[] = [
  {
    id: "ef-defacc",
    keywords: [
      "def/acc",
      "defacc",
      "defensive acceleration",
      "entrepreneur first",
      "joinef",
      "ef cohort",
      "ef programme",
      "ef program",
      "matt clifford",
    ],
    context: `def/acc (defensive acceleration) is a programme run by Entrepreneur First (EF), the world's leading talent investor. EF was founded in 2011 by Matt Clifford and Alice Bentinck and has helped create over 600 companies with a combined value exceeding $11 billion.

The def/acc programme is built on the idea that the most powerful response to technological risk is often better technology: strengthening the shield rather than blunting the spear. It focuses on building protective technology to address the biggest threats the world faces, including pandemics, cybercrime, powerful AI, and nuclear war.

Programme structure:
- 24 weeks total (12 weeks initial in London + 12 weeks seed preparation, with optional San Francisco extension)
- Stipend covering living expenses during the first 12 weeks
- Investment: $125,000 for 8% equity, plus $125,000 MFN SAFE
- Matt Clifford personally advises all funded teams
- Primarily for individuals pre-company (EF's standard model), with limited spots for existing teams

Key focus areas:
- AI safety technologies and alignment for multi-agent environments
- Defensive cyber capabilities for government and critical infrastructure
- Information integrity tools (described as "community notes for everything")
- Human agency preservation in AI-driven environments
- Pandemic prevention, detection, and vaccine development
- Governance tools for managing powerful AI systems

Notable advisors and speakers include Reid Hoffman, Eric Schmidt (former Google CEO), Kate Bingham (former UK Vaccine Taskforce Chair), Jack Clark (Anthropic cofounder), Jason Matheny (RAND CEO), and Patrick Vallance (former UK Chief Scientific Adviser).

The term "def/acc" was originally inspired by Vitalik Buterin's essay arguing for prioritising technologies that reliably make the world better over those that create ambiguous or risky capabilities.

Source: https://www.joinef.com/posts/introducing-def-acc-at-ef/`,
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Find a known poster profile by name (case-insensitive, trimmed).
 */
export function findPosterProfile(posterName: string): PosterProfile | undefined {
  const needle = normalise(posterName);
  return POSTER_PROFILES.find((p) => normalise(p.name) === needle);
}

/**
 * Scan source material for keywords and return all matching organisational
 * context blocks.  Also includes any context triggered by the poster's own
 * `contextKeywords` (if a known profile was found).
 */
export function findRelevantContext(
  sourceMaterial: string,
  posterProfile?: PosterProfile
): OrganisationalContext[] {
  const haystack = normalise(sourceMaterial);

  const matched = new Map<string, OrganisationalContext>();

  for (const ctx of ORGANISATIONAL_CONTEXTS) {
    if (ctx.keywords.some((kw) => haystack.includes(normalise(kw)))) {
      matched.set(ctx.id, ctx);
    }
  }

  // If the poster has context keywords, check those too
  if (posterProfile) {
    for (const kw of posterProfile.contextKeywords) {
      if (haystack.includes(normalise(kw))) {
        for (const ctx of ORGANISATIONAL_CONTEXTS) {
          if (ctx.keywords.some((k) => normalise(k) === normalise(kw)) && !matched.has(ctx.id)) {
            matched.set(ctx.id, ctx);
          }
        }
      }
    }
  }

  return Array.from(matched.values());
}

/**
 * Build the full background text to write into `poster-background.txt`.
 * Returns `null` if there is nothing to include.
 */
export function buildPosterBackgroundText(
  posterProfile: PosterProfile | undefined,
  relevantContexts: OrganisationalContext[]
): string | null {
  const sections: string[] = [];

  if (posterProfile) {
    sections.push(`## ABOUT THE POSTER\n\n${posterProfile.background}`);
  }

  if (relevantContexts.length > 0) {
    const contextBlocks = relevantContexts.map((ctx) => ctx.context).join("\n\n---\n\n");
    sections.push(`## RELEVANT PROGRAMME / ORGANISATION CONTEXT\n\n${contextBlocks}`);
  }

  if (sections.length === 0) return null;

  return sections.join("\n\n---\n\n");
}
