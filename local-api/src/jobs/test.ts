import { Router } from "express";
import { runClaudeJob, log } from "../lib/claude-runner.js";
import { MODEL_MAP, resolveModel } from "../lib/job-utils.js";

const router = Router();

interface TestJobRequest {
  runId: string;
  model?: string;
  callbackUrl: string;
}

router.post("/test", (req, res) => {
  const { runId, model, callbackUrl } = req.body as TestJobRequest;

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
    model: resolveModel(model, MODEL_MAP.haiku),
    maxTurns: 2,
    allowedTools: [],
    prompt: "Write a short haiku about software testing. Return only the haiku, nothing else.",
  });
});

export default router;
