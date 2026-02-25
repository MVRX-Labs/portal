import { readFile } from "fs/promises";
import { join } from "path";

const APIFY_BASE = "https://api.apify.com/v2";
const POSTS_ACTOR_ID = "Wpp1BZ6yGWjySadk3";
const PROFILE_ACTOR_ID = "VhxlqQXRwhW8H5hNV";

const EXAMPLE_DOCS_DIR = join(
  process.cwd(),
  "src/app/api/tools/linkedin-audit"
);

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

async function runApifyActor(actorId: string, input: unknown): Promise<unknown> {
  const token = requiredEnv("APIFY_API_TOKEN");
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Apify actor ${actorId} failed (${res.status}): ${body.slice(0, 500)}`
    );
  }

  return res.json();
}

function extractSlug(linkedinUrl: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) {
    throw new Error(
      `Could not extract LinkedIn slug from URL: ${linkedinUrl}`
    );
  }
  return match[1];
}

export async function runLinkedInAudit(linkedinUrl: string): Promise<string> {
  const slug = extractSlug(linkedinUrl);

  const [profileData, postsData, jonathanDocx, kamilDocx] = await Promise.all([
    runApifyActor(PROFILE_ACTOR_ID, { username: slug }),
    runApifyActor(POSTS_ACTOR_ID, {
      urls: [linkedinUrl],
      limitPerSource: 20,
      deepScrape: true,
    }),
    readFile(join(EXAMPLE_DOCS_DIR, "jonathan-low-linkedin-audit.docx")),
    readFile(join(EXAMPLE_DOCS_DIR, "kamil-sidor-linkedin-audit.docx")),
  ]);

  const ngrokBase = requiredEnv("NGROK_BASE_URL");
  const apiKey = requiredEnv("DANNY_LOCAL_API_KEY");

  const claudeRes = await fetch(`${ngrokBase}/claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      prompt: `Create a linkedin profile audit for https://www.linkedin.com/in/${slug}. Attached is data scraped from their LinkedIn page and a couple of example reports for different accounts so you can match the formatting.`,
      files: {
        "scraped-profile.json": JSON.stringify(profileData, null, 2),
        "scraped-posts.json": JSON.stringify(postsData, null, 2),
      },
      binaryFiles: {
        "example-jonathan-low-audit.docx": jonathanDocx.toString("base64"),
        "example-kamil-sidor-audit.docx": kamilDocx.toString("base64"),
      },
      maxTurns: 5,
    }),
  });

  if (!claudeRes.ok) {
    const body = await claudeRes.text();
    throw new Error(
      `Claude API failed (${claudeRes.status}): ${body.slice(0, 500)}`
    );
  }

  const result = (await claudeRes.json()) as { output: string };
  return result.output;
}
