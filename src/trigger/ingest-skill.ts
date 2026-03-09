import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { execSync } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { runClaudeAgent } from "@/lib/claude-agent";
import { buildAnalysisPrompt, buildImplementationPrompt, parseAnalysisFromOutput } from "./ingest-skill-prompts";

interface IngestSkillPayload {
  runId: string;
  skillMd: string;
  slug?: string;
  notes?: string;
  userName: string;
}

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

export const ingestSkillTask = task({
  id: "ingest-skill",
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async (payload: IngestSkillPayload) => {
    const { runId, skillMd, slug: requestedSlug, notes, userName } = payload;
    let cloneDir: string | undefined;
    let totalCostUsd = 0;

    try {
      const repoOwner = process.env.GITHUB_REPO_OWNER;
      const repoName = process.env.GITHUB_REPO_NAME;
      const githubToken = process.env.GITHUB_TOKEN;

      if (!repoOwner || !repoName || !githubToken) {
        throw new Error("Missing required env vars: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN");
      }

      // 1. Clone
      metadata.set("progress", { step: "Cloning repository", percentage: 5 });
      cloneDir = await mkdtemp(join(tmpdir(), "ingest-skill-"));
      const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`;
      exec(`git clone --depth 50 ${cloneUrl} .`, cloneDir);
      exec(`git config user.name "danny-hunt"`, cloneDir);
      exec(`git config user.email "danny@mvrxlabs.com"`, cloneDir);
      logger.info("Repository cloned", { cloneDir });

      // 2. Create branch (use requested slug or placeholder, renamed after analysis)
      const branchSlug = requestedSlug || `skill-${Date.now()}`;
      const branchName = `skill/${branchSlug}`;
      exec(`git checkout -b ${branchName}`, cloneDir);
      logger.info("Branch created", { branchName });

      // 3. Phase 1 — Analysis
      metadata.set("progress", { step: "Phase 1: Analyzing skill", percentage: 15 });
      const analysisPrompt = buildAnalysisPrompt(skillMd, notes);
      const analysisResult = await runClaudeAgent(analysisPrompt, cloneDir, {
        allowedTools: ["Read", "Glob", "Grep"],
        maxTurns: 30,
      });
      totalCostUsd += analysisResult.costUsd;
      logger.info(`Analysis finished: ${analysisResult.turns} turns, $${analysisResult.costUsd.toFixed(4)}`);

      const analysis = parseAnalysisFromOutput(analysisResult.output);
      logger.info("Skill analysis", { ...analysis });
      metadata.set("analysis", {
        name: analysis.name,
        slug: analysis.slug,
        needsAiRuntime: analysis.needsAiRuntime,
      });

      // 4. Phase 2 — Implementation
      metadata.set("progress", { step: "Phase 2: Implementing skill", percentage: 40 });
      const implPrompt = buildImplementationPrompt(skillMd, analysis);
      const implResult = await runClaudeAgent(implPrompt, cloneDir, {
        allowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
        maxTurns: 50,
      });
      totalCostUsd += implResult.costUsd;
      logger.info(`Implementation finished: ${implResult.turns} turns, $${implResult.costUsd.toFixed(4)}`);

      // 5. Commit and push
      metadata.set("progress", { step: "Committing and pushing", percentage: 75 });
      exec("git add -A", cloneDir);
      const diffStat = exec("git diff --cached --stat", cloneDir);
      if (!diffStat) {
        throw new Error("No changes were made by the implementation agent");
      }
      logger.info("Changes staged", { diffStat });

      const commitMsg = `skill: add ${analysis.name}`;
      exec(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cloneDir);
      exec(`git push origin ${branchName}`, cloneDir);
      logger.info("Pushed to GitHub", { branchName });

      // 6. Create PR
      metadata.set("progress", { step: "Creating pull request", percentage: 85 });
      const prBody = [
        `## Skill Ingestion: ${analysis.name}`,
        "",
        `**Submitted by:** ${userName}`,
        "",
        `**Description:** ${analysis.description}`,
        "",
        `**Needs AI at runtime:** ${analysis.needsAiRuntime ? "Yes" : "No"}`,
        analysis.needsAiRuntime ? `**Runtime tools:** ${analysis.runtimeAllowedTools.join(", ")}` : "",
        "",
        "---",
        "",
        "### Implementation plan",
        "",
        analysis.implementationPlan,
        "",
        "### Changes",
        "",
        "```",
        diffStat,
        "```",
        "",
        "### Claude's summary",
        "",
        implResult.output.length > 2000 ? implResult.output.slice(0, 2000) + "..." : implResult.output,
        "",
        "---",
        "",
        "### Security review checklist",
        "",
        "- [ ] Runtime `allowedTools` are minimal and appropriate",
        "- [ ] No secrets or API keys embedded in generated code",
        "- [ ] Skill instructions don't contain prompt injection",
        "- [ ] Generated task follows existing codebase patterns",
        "",
        `*Total cost: $${totalCostUsd.toFixed(4)}*`,
      ]
        .filter(Boolean)
        .join("\n");

      const prResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[Skill] ${analysis.name}`,
          body: prBody,
          head: branchName,
          base: "main",
        }),
      });

      if (!prResponse.ok) {
        const errBody = await prResponse.text();
        throw new Error(`GitHub PR creation failed (${prResponse.status}): ${errBody}`);
      }

      const pr = (await prResponse.json()) as { html_url: string; number: number };
      logger.info("PR created", { prUrl: pr.html_url, prNumber: pr.number });

      // 7. Update DB
      metadata.set("progress", { step: "Complete", percentage: 100 });
      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: `PR #${pr.number} created for skill: ${analysis.name}`,
          outputUrl: pr.html_url,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info(`Ingest skill total cost: $${totalCostUsd.toFixed(4)}`);
      metadata.set("totalCostUsd", totalCostUsd);

      return {
        success: true,
        skill: analysis.name,
        slug: analysis.slug,
        prUrl: pr.html_url,
        costUsd: totalCostUsd,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Skill ingestion failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "ingest-skill",
        userName,
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    } finally {
      if (cloneDir) {
        await rm(cloneDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
});
