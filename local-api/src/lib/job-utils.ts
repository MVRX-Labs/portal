import { readdir, readFile } from "fs/promises";
import { join } from "path";

export const OUTPUT_DIR = "/Users/danny/Google Drive/Shared drives/Shared Drive - MVRX/Generated materials";

export const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};

export function resolveModel(requested: string | undefined, fallback: string): string {
  if (requested && MODEL_MAP[requested]) return MODEL_MAP[requested];
  return fallback;
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
