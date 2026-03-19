import { schedules, logger, metadata } from "@trigger.dev/sdk/v3";
import { execSync } from "child_process";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { sendSlackIdeaNotification } from "@/lib/slack";
import { runClaudeAgent } from "@/lib/claude-agent";
import {
  randomizeConfig,
  buildIdeationPrompt,
  buildImplementationPrompt,
  parseIdeaFromOutput,
  IdeaConfig,
} from "./idea-generator-prompts";

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00:00`;
}

export const ideaGeneratorTask = schedules.task({
  id: "idea-generator",
  // cron: { pattern: "0 9 * * 1-5", timezone: "Europe/London" },
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async () => {
    const repoOwner = process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GITHUB_REPO_NAME;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!repoOwner || !repoName || !githubToken) {
      throw new Error("Missing required env vars: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN");
    }

    const config: IdeaConfig = randomizeConfig();
    logger.info("Idea generator config", { config });
    metadata.set("config", {
      scope: config.scope,
      multiIdea: config.multiIdea,
      useWebSearch: config.useWebSearch,
    });

    let cloneDir: string | undefined;
    let ideaTitle = "(unknown)";
    let totalCostUsd = 0;

    try {
      // 1. Clone
      metadata.set("progress", { step: "Cloning repository", percentage: 5 });
      cloneDir = await mkdtemp(join(tmpdir(), "idea-generator-"));
      const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`;
      exec(`git clone --depth 50 ${cloneUrl} .`, cloneDir);
      exec(`git config user.name "danny-hunt"`, cloneDir);
      exec(`git config user.email "danny@mvrxlabs.com"`, cloneDir);
      logger.info("Repository cloned", { cloneDir });

      // 2. Read existing IDEAS.md
      let existingIdeas = "";
      try {
        existingIdeas = await readFile(join(cloneDir, "IDEAS.md"), "utf-8");
      } catch {
        // File doesn't exist yet
      }

      // 3. Create branch
      metadata.set("progress", { step: "Creating branch", percentage: 10 });
      const ts = formatTimestamp();
      const suffix = Math.random().toString(36).slice(2, 6);
      const branchName = `idea/${ts.replace(/[: ]/g, "-").slice(0, 13)}-${suffix}`;
      exec(`git checkout -b ${branchName}`, cloneDir);

      // 4. Phase 1 — Ideation
      metadata.set("progress", { step: "Phase 1: Generating idea", percentage: 15 });
      const ideationPrompt = buildIdeationPrompt(config, existingIdeas);
      const ideationTools = config.useWebSearch
        ? ["Read", "Glob", "Grep", "WebSearch", "WebFetch"]
        : ["Read", "Glob", "Grep"];

      const ideationResult = await runClaudeAgent(ideationPrompt, cloneDir, {
        allowedTools: ideationTools,
        maxTurns: 40,
      });
      totalCostUsd += ideationResult.costUsd;
      logger.info(
        `Ideation finished: ${ideationResult.turns} turns, $${ideationResult.costUsd.toFixed(4)}, ${ideationResult.durationMs}ms`
      );

      const idea = parseIdeaFromOutput(ideationResult.output);
      ideaTitle = idea.title;
      logger.info("Chosen idea", idea);
      metadata.set("idea", idea);

      // 5. Phase 2 — Implementation
      metadata.set("progress", { step: "Phase 2: Implementing idea", percentage: 40 });
      const implPrompt = buildImplementationPrompt(idea);
      const implResult = await runClaudeAgent(implPrompt, cloneDir, {
        allowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
        maxTurns: 50,
      });
      totalCostUsd += implResult.costUsd;
      logger.info(
        `Implementation finished: ${implResult.turns} turns, $${implResult.costUsd.toFixed(4)}, ${implResult.durationMs}ms`
      );

      // 6. Commit implementation changes to feature branch
      metadata.set("progress", { step: "Committing implementation", percentage: 70 });
      exec("git add -A", cloneDir);
      const diffStat = exec("git diff --cached --stat", cloneDir);
      if (!diffStat) {
        throw new Error("No changes were made by the implementation agent");
      }
      logger.info("Changes staged", { diffStat });

      const commitMessage = `idea: ${idea.title.slice(0, 72)}`;
      exec(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, cloneDir);
      exec(`git push origin ${branchName}`, cloneDir);

      // 7. Push IDEAS.md update directly to main (prevents repeat ideas)
      metadata.set("progress", { step: "Updating IDEAS.md on main", percentage: 75 });
      exec("git checkout main", cloneDir);
      const ideasPath = join(cloneDir, "IDEAS.md");
      let ideasContent = "";
      try {
        ideasContent = await readFile(ideasPath, "utf-8");
      } catch {
        ideasContent = "# IDEAS\n\n";
      }
      const newLine = `- ${ts}: ${idea.title}\n`;
      if (!ideasContent.includes(idea.title)) {
        await writeFile(ideasPath, ideasContent.trimEnd() + "\n" + newLine, "utf-8");
        exec("git add IDEAS.md", cloneDir);
        exec(`git commit -m "ideas: add ${idea.title.slice(0, 60).replace(/"/g, '\\"')}"`, cloneDir);
        exec("git push origin main", cloneDir);
        logger.info("IDEAS.md pushed to main");
      }
      logger.info("Pushed to GitHub", { branchName });

      // 8. Create PR
      metadata.set("progress", { step: "Creating pull request", percentage: 85 });
      const prBody = [
        `## Idea Bot`,
        "",
        `**Idea:** ${idea.title}`,
        "",
        `**Description:** ${idea.description}`,
        "",
        `**Scope:** ${config.scope}`,
        "",
        "---",
        "",
        "### Implementation plan",
        "",
        idea.plan,
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
        `---`,
        `*Total cost: $${totalCostUsd.toFixed(4)}*`,
      ].join("\n");

      const prResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[Idea Bot] ${idea.title}`,
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

      // 9. Slack notification
      metadata.set("progress", { step: "Sending Slack notification", percentage: 95 });
      await sendSlackIdeaNotification({
        type: "pr_created",
        idea: idea.title,
        scope: config.scope,
        prUrl: pr.html_url,
        branchName,
        costUsd: totalCostUsd,
      });

      // 10. Log total cost
      logger.info(`Idea generator total cost: $${totalCostUsd.toFixed(4)}`);
      metadata.set("progress", { step: "Complete", percentage: 100 });
      metadata.set("totalCostUsd", totalCostUsd);

      return { success: true, idea: idea.title, prUrl: pr.html_url, costUsd: totalCostUsd };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Idea generator failed: ${errorMessage}`);

      await sendSlackIdeaNotification({
        type: "failed",
        idea: ideaTitle,
        scope: config.scope,
        error: errorMessage,
      }).catch(() => {});

      throw err;
    } finally {
      if (cloneDir) {
        await rm(cloneDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
});
