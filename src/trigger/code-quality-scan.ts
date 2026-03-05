import { schedules, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

async function sendSlackNotification(message: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Doc Gardening",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: message } }],
    }),
  });
}

const PROMPT = `You are a "doc gardening" agent. Your job is to check whether the documentation in this repository still accurately represents the actual code.

Review these documentation files against the real codebase:
- CLAUDE.md (the agent instruction map — does it point to the right files? are the rules still accurate?)
- docs/architecture.md (dependency layers, directory structure, list of background jobs, database tables)
- docs/design-decisions.md (are decisions still current? any new major decisions missing?)
- docs/local-dev.md (are the commands and setup steps still correct?)
- docs/plans/active/ (are any plans here actually completed and should be moved to completed/?)

For each doc, read the file, then explore the actual code to verify claims. For example:
- Does the list of Trigger.dev tasks in architecture.md match what's actually in src/trigger/?
- Does the dependency layer diagram still hold? Are there new patterns not documented?
- Are there new database tables not listed?
- Are the npm scripts in local-dev.md still accurate vs package.json?
- Are there new design decisions that should be captured (new integrations, new patterns)?

Think about this the way a senior engineer would think about onboarding docs: what would mislead a new contributor or an AI agent working on this codebase?

Rules:
- Read files with the Read tool, search with Glob and Grep
- Fix inaccuracies by editing the doc files directly with Edit
- Do NOT change any code files — only documentation (*.md files in docs/, CLAUDE.md, NOTES.md)
- Keep docs concise. Don't add fluff — every line should be useful to an agent or developer
- If everything is accurate, make no changes and say so
- NO git commands
- NO npm/yarn/pnpm commands`;

export const codeQualityScanTask = schedules.task({
  id: "code-quality-scan",
  cron: { pattern: "0 8 * * 1", timezone: "Europe/London" },
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async () => {
    const repoOwner = process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GITHUB_REPO_NAME;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!repoOwner || !repoName || !githubToken) {
      throw new Error("Missing required env vars: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN");
    }

    let cloneDir: string | undefined;

    try {
      // 1. Clone
      metadata.set("progress", { step: "Cloning repository", percentage: 5 });
      cloneDir = await mkdtemp(join(tmpdir(), "doc-gardening-"));
      const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`;
      exec(`git clone --depth 50 ${cloneUrl} .`, cloneDir);
      exec(`git config user.name "vex"`, cloneDir);
      exec(`git config user.email "danny@mvrxlabs.com"`, cloneDir);
      logger.info("Repository cloned", { cloneDir });

      // 2. Create branch
      metadata.set("progress", { step: "Creating branch", percentage: 10 });
      const date = new Date().toISOString().slice(0, 10);
      const branchName = `doc-gardening/${date}`;
      exec(`git checkout -b ${branchName}`, cloneDir);

      // 3. Run Claude to audit and fix docs
      metadata.set("progress", { step: "Auditing documentation with Claude", percentage: 15 });
      logger.info("Starting Claude doc gardening agent");

      let claudeOutput = "";
      for await (const message of query({
        prompt: PROMPT,
        options: {
          model: "claude-sonnet-4-6",
          cwd: cloneDir,
          allowedTools: ["Read", "Edit", "Glob", "Grep"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 40,
          persistSession: false,
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("name" in block) {
              logger.info(`Tool call: ${(block as any).name}`);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            claudeOutput = message.result;
            logger.info(
              `Claude finished: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}, ${message.duration_ms}ms`
            );
          } else {
            const msg = message as any;
            const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
            throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
          }
        }
      }

      // 4. Check if any changes were made
      metadata.set("progress", { step: "Checking for changes", percentage: 80 });
      const diffStat = exec("git diff --stat", cloneDir);

      if (!diffStat) {
        logger.info("No doc changes needed — everything is up to date");
        await sendSlackNotification("*Doc Gardening (weekly):* All documentation is up to date. No changes needed.");
        metadata.set("progress", { step: "Complete — no changes", percentage: 100 });
        return { changed: false, summary: claudeOutput };
      }

      // 5. Commit and push
      metadata.set("progress", { step: "Creating PR", percentage: 85 });
      exec("git add -A", cloneDir);
      exec(`git commit -m "docs: weekly doc gardening — sync docs with codebase"`, cloneDir);
      exec(`git push origin ${branchName}`, cloneDir);
      logger.info("Pushed doc updates", { branchName, diffStat });

      // 6. Create PR
      const prBody = [
        "## Weekly Doc Gardening",
        "",
        "Automated scan that checks documentation against the actual codebase and fixes inaccuracies.",
        "",
        "### Changes",
        "",
        "```",
        diffStat,
        "```",
        "",
        "### Claude's summary",
        "",
        claudeOutput.length > 3000 ? claudeOutput.slice(0, 3000) + "..." : claudeOutput,
      ].join("\n");

      const prResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[Doc Gardening] Sync docs with codebase (${date})`,
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

      await sendSlackNotification(
        `*Doc Gardening (weekly):* Found doc drift and opened a fix.\n*PR:* ${pr.html_url}\n\n${diffStat}`
      );

      metadata.set("progress", { step: "Complete", percentage: 100 });
      return { changed: true, prUrl: pr.html_url, summary: claudeOutput };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Doc gardening failed: ${errorMessage}`);
      await sendSlackNotification(`*Doc Gardening (weekly):* Failed — ${errorMessage}`);
      throw err;
    } finally {
      if (cloneDir) {
        await rm(cloneDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
});
