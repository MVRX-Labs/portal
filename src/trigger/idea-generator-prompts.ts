export interface IdeaConfig {
  scope: "small" | "big";
  multiIdea: boolean;
  useWebSearch: boolean;
}

export function randomizeConfig(): IdeaConfig {
  return {
    scope: Math.random() < 0.4 ? "small" : "big",
    multiIdea: Math.random() < 0.4,
    useWebSearch: Math.random() < 0.3,
  };
}

function buildWebSearchGuidance(): string {
  const topics = [
    "Search for recent trends in B2B SaaS internal tools and see if any ideas apply to this portal.",
    "Search for best practices in LinkedIn automation tools and see what features competitors offer.",
    "Search for modern UX patterns for dashboard and analytics tools.",
    "Search for recent improvements in AI-assisted content generation workflows.",
    "Search for developer productivity tool features that could inspire internal tooling improvements.",
  ];
  return topics[Math.floor(Math.random() * topics.length)];
}

export function buildIdeationPrompt(config: IdeaConfig, existingIdeas: string): string {
  const scopeGuidance =
    config.scope === "small"
      ? `Focus on a SMALL, targeted improvement — a UX tweak, a minor feature addition, a helpful default, better error handling, a missing validation, or a small quality-of-life fix. Something that can be implemented in under 30 minutes of coding.`
      : `Focus on a BIG, ambitious improvement — a new feature, a new integration, a significant workflow improvement, or a meaningful architectural enhancement. Something that adds real value but is still implementable in a single PR.`;

  const approachGuidance = config.multiIdea
    ? `Generate 3-5 candidate ideas, then evaluate each for impact vs effort. Pick the single best one.`
    : `Generate a single strong idea.`;

  const webSearchGuidance = config.useWebSearch
    ? `\nBefore brainstorming, do some web research for inspiration:\n${buildWebSearchGuidance()}\nUse what you find to inform your idea, but the idea must be specific to THIS codebase.`
    : "";

  return `You are an "idea bot" for a product codebase. Your job is to come up with a concrete, implementable product improvement idea.

First, explore the codebase to understand what the product does:
- Read CLAUDE.md for an overview
- Browse src/trigger/, src/app/, src/components/, src/lib/ to understand existing features
- Read docs/architecture.md and docs/design-decisions.md for context

Then read IDEAS.md (if it exists) to see what ideas have already been proposed. Do NOT repeat any existing idea.

Here are the existing ideas (if any):
${existingIdeas || "(none yet)"}
${webSearchGuidance}

${scopeGuidance}

${approachGuidance}

Output your chosen idea as a JSON block (and nothing else after the JSON):
\`\`\`json
{
  "title": "Short one-liner title for the idea",
  "description": "2-3 sentence description of what to build and why it's valuable",
  "plan": "Step-by-step implementation plan (what files to create/modify, what the changes are)"
}
\`\`\`

Rules:
- Read files with the Read tool, search with Glob and Grep
- Do NOT modify any files — this is ideation only
- NO git commands
- NO npm/yarn/pnpm commands
- The idea must be implementable within this codebase — no vague suggestions
- Be creative but practical`;
}

export function buildImplementationPrompt(idea: { title: string; description: string; plan: string }): string {
  return `You are implementing a product improvement idea in this codebase.

**Idea:** ${idea.title}

**Description:** ${idea.description}

**Plan:** ${idea.plan}

Start by reading CLAUDE.md and the relevant files mentioned in the plan. Explore the codebase to understand existing patterns, then implement the idea.

Rules:
- Explore the codebase with Glob, Grep, and Read first to understand patterns
- Use Write for new files, Edit for modifications
- Follow existing patterns and conventions in the codebase
- NO git commands
- NO npm/yarn/pnpm install or package management commands
- NO changes to config files (trigger.config.ts, tsconfig.json, package.json, etc.)
- Make changes complete — no TODOs, placeholders, or "coming soon" comments
- Keep files under 300 lines as per project conventions
- If the plan is unclear, make a reasonable interpretation and implement it fully`;
}

export function parseIdeaFromOutput(output: string): { title: string; description: string; plan: string } {
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    throw new Error("Ideation agent did not output a valid JSON block");
  }
  const parsed = JSON.parse(jsonMatch[1]);
  if (!parsed.title || !parsed.description || !parsed.plan) {
    throw new Error("Ideation agent JSON missing required fields (title, description, plan)");
  }
  return parsed;
}
