import { Router } from "express";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { runClaudeJob, log } from "../lib/claude-runner.js";

const router = Router();

const DATA_DIR = join(import.meta.dirname, "../../data");
const OUTPUT_DIR = "/Users/danny/Google Drive/Shared drives/Shared Drive - MVRX/Generated materials";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ─── LinkedIn Audit ─────────────────────────────────────────────────────────

interface LinkedInAuditRequest {
  runId: string;
  slug: string;
  profileData: unknown;
  postsData: unknown;
  callbackUrl: string;
}

router.post("/linkedin-audit", (req, res) => {
  const { runId, slug, profileData, postsData, callbackUrl } = req.body as LinkedInAuditRequest;

  if (!runId || !slug || !callbackUrl) {
    res.status(400).json({ error: "runId, slug, and callbackUrl are required" });
    return;
  }

  log(runId, `Received linkedin-audit job for slug "${slug}"`);
  res.status(202).json({ status: "accepted" });

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: HAIKU_MODEL, // TODO: change before merge
    maxTurns: 25,
    prompt: [
      `Create a linkedin profile audit for https://www.linkedin.com/in/${slug}.`,
      `Attached is data scraped from their LinkedIn page and a couple of example reports for different accounts so you can match the formatting.`,
      ``,
      `Save the final audit document (as a .docx file) to: ${OUTPUT_DIR}/`,
      `Name the file with the name: "MVRX | <USER'S NAME> | LinkedIn Audit.docx`,
      ``,
      `IMPORTANT: Do not create, modify, or delete any files outside your working directory and the output directory above.`,
    ].join("\n"),
    setupSession: async (dir) => {
      await writeFile(join(dir, "scraped-profile.json"), JSON.stringify(profileData, null, 2), "utf-8");
      await writeFile(join(dir, "scraped-posts.json"), JSON.stringify(postsData, null, 2), "utf-8");

      const jonathanDocx = await readFile(join(DATA_DIR, "jonathan-low-linkedin-audit.docx"));
      const kamilDocx = await readFile(join(DATA_DIR, "kamil-sidor-linkedin-audit.docx"));

      await writeFile(join(dir, "example-jonathan-low-audit.docx"), jonathanDocx);
      await writeFile(join(dir, "example-kamil-sidor-audit.docx"), kamilDocx);
    },
  });
});

// ─── System Test ────────────────────────────────────────────────────────────

interface TestJobRequest {
  runId: string;
  callbackUrl: string;
}

router.post("/test", (req, res) => {
  const { runId, callbackUrl } = req.body as TestJobRequest;

  if (!runId || !callbackUrl) {
    res.status(400).json({ error: "runId and callbackUrl are required" });
    return;
  }

  log(runId, "Received test job");
  res.status(202).json({ status: "accepted" });

  runClaudeJob({
    runId,
    callbackUrl,
    apiKey: process.env.DANNY_LOCAL_API_KEY || "",
    vercelBypassSecret: process.env.VERCEL_BYPASS_SECRET,
    model: HAIKU_MODEL,
    maxTurns: 2,
    allowedTools: [],
    prompt: "Write a short haiku about software testing. Return only the haiku, nothing else.",
  });
});

export default router;
