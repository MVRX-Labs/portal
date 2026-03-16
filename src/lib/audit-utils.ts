import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { runClaudeAgent } from "@/lib/claude-agent";

export const OUTPUT_DIR = "/Users/danny/Google Drive/Shared drives/Shared Drive - MVRX/Generated materials";

export async function resolveOutputDir(accountName?: string): Promise<string> {
  if (!accountName) return OUTPUT_DIR;
  const dir = join(OUTPUT_DIR, accountName);
  await mkdir(dir, { recursive: true });
  return dir;
}

const MODELS = ["haiku", "sonnet", "opus"] as const;
export type MODEL_IDS = (typeof MODELS)[number];

const MODEL_PROVIDER_MODEL_IDS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"] as const;
export type MODEL_PROVIDER_MODEL_IDS = (typeof MODEL_PROVIDER_MODEL_IDS)[number];

export const MODEL_MAP: Record<MODEL_IDS, MODEL_PROVIDER_MODEL_IDS> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};

export function resolveModel(requested: string | undefined, fallback: string): string {
  return MODEL_MAP[requested as MODEL_IDS] ?? fallback;
}

export function currentMonth(): string {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1];
  const bare = raw.match(/\{[\s\S]*\}/);
  if (bare) return bare[0];
  throw new Error("No JSON object found in Claude output");
}

/**
 * Attempts to repair malformed JSON by invoking Claude Code, which can
 * read the broken file, edit it, run `node -e JSON.parse(...)` to validate,
 * and loop until the JSON is valid.
 */
export async function repairJSON(
  raw: string,
  parseError: string,
  sessionDir: string,
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void }
): Promise<string> {
  const brokenPath = join(sessionDir, "review-output-broken.json");
  const fixedPath = join(sessionDir, "review-output-fixed.json");
  await writeFile(brokenPath, raw);

  const prompt = `\
review-output-broken.json failed to parse with: ${parseError}

Read the file, extract the JSON object (stripping any markdown fences or surrounding commentary), fix all syntax errors, and write valid JSON to review-output-fixed.json. Validate with: node -e "JSON.parse(require('fs').readFileSync('review-output-fixed.json','utf-8'))"

If validation fails, read the error, fix the file, and retry until it passes.`;

  const result = await runClaudeAgent(prompt, sessionDir, {
    allowedTools: ["Read", "Edit", "Write", "Bash"],
    maxTurns: 20,
    model: "claude-opus-4-6",
  });

  logger.info("JSON repair via Claude Code completed", {
    costUsd: result.costUsd.toFixed(4),
    turns: result.turns,
    durationMs: result.durationMs,
  });

  const fixed = await readFile(fixedPath, "utf-8");
  // Final validation — will throw if still broken
  JSON.parse(fixed);
  return fixed;
}

export async function extractJSONFromSessionDir(dir: string): Promise<string> {
  const files = await readdir(dir);
  const candidates = files.filter((f) => f.endsWith(".json") && !f.startsWith("scraped-"));

  for (const file of candidates) {
    const content = await readFile(join(dir, file), "utf-8");
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && "personName" in parsed) {
        return content;
      }
    } catch {}
  }

  throw new Error("No JSON object found in Claude output or session directory files");
}
