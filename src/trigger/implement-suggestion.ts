import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackSuggestionNotification } from "@/lib/slack";
import { TOOLS } from "@/lib/types";

interface ImplementSuggestionPayload {
  runId: string;
  toolId: string;
  description: string;
  userName: string;
}

const TOOL_TRIGGER_FILE: Record<string, string> = {
  "linkedin-audit": "src/trigger/linkedin-audit.ts",
  "linkedin-humanizer": "src/trigger/linkedin-humanizer.ts",
  "linkedin-post-generator": "src/trigger/linkedin-post-generator.ts",
  "gtm-strategy": "src/trigger/gtm-strategy.ts",
  "sentiment-analysis": "src/trigger/sentiment-analysis.ts",
  "outbound-sequence": "src/trigger/outbound-sequence.ts",
};

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function buildPrompt(toolId: string, toolName: string, description: string): string {
  const triggerFile = TOOL_TRIGGER_FILE[toolId] || `src/trigger/${toolId}.ts`;

  return `You are improving the "${toolName}" tool in this codebase.

The user has requested:
${description}

Key files for this tool:
- Trigger task: ${triggerFile}
- API route: src/app/api/tools/${toolId}/route.ts
- UI page: src/app/tools/${toolId}/page.tsx
- Shared UI: src/components/tool-form.tsx

Start by reading these files to understand the current implementation, then explore related files as needed.

Rules:
- Explore the codebase with Glob and Read first to understand patterns
- Use Write for new files, Edit for modifications
- Follow existing patterns and conventions
- NO git commands
- NO npm/yarn/pnpm install or package management commands
- NO changes to config files (trigger.config.ts, tsconfig.json, package.json, etc.)
- Make changes complete — no TODOs, placeholders, or "coming soon" comments
- If the suggestion is unclear, make a reasonable interpretation and implement it fully`;
}

export const implementSuggestionTask = task({
  id: "implement-suggestion",
  maxDuration: 3600,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: ImplementSuggestionPayload) => {
    const { runId, toolId, description, userName } = payload;
    const toolConfig = TOOLS.find((t) => t.id === toolId);
    const toolName = toolConfig?.name || toolId;
    let cloneDir: string | undefined;

    try {
      const repoOwner = process.env.GITHUB_REPO_OWNER;
      const repoName = process.env.GITHUB_REPO_NAME;
      const githubToken = process.env.GITHUB_TOKEN;

      if (!repoOwner || !repoName || !githubToken) {
        throw new Error("Missing required env vars: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN");
      }

      // 1. Clone
      metadata.set("progress", { step: "Cloning repository", percentage: 5 });
      cloneDir = await mkdtemp(join(tmpdir(), "suggestion-"));
      const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`;
      exec(`git clone --depth 50 ${cloneUrl} .`, cloneDir);
      exec(`git config user.name "vex"`, cloneDir);
      exec(`git config user.email "danny@mvrxlabs.com"`, cloneDir); // vercel requires a user email that we have :')
      logger.info("Repository cloned", { cloneDir });

      // 2. Create branch
      metadata.set("progress", { step: "Creating branch", percentage: 10 });
      const branchName = `suggestion/${runId}/${toolId}`;
      exec(`git checkout -b ${branchName}`, cloneDir);
      logger.info("Branch created", { branchName });

      // 3. Run Claude
      metadata.set("progress", { step: "Implementing suggestion with Claude", percentage: 15 });
      const prompt = buildPrompt(toolId, toolName, description);
      logger.info("Starting Claude Agent SDK", { model: "claude-opus-4-6" });

      let claudeOutput = "";
      for await (const message of query({
        prompt,
        options: {
          model: "claude-opus-4-6",
          cwd: cloneDir,
          allowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 50,
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

      // 4. Commit
      metadata.set("progress", { step: "Committing changes", percentage: 60 });
      exec("git add -A", cloneDir);
      const diffStat = exec("git diff --cached --stat", cloneDir);
      if (!diffStat) {
        throw new Error("Claude made no changes to the codebase");
      }
      logger.info("Changes staged", { diffStat });

      const commitMessage = `suggestion: ${description.slice(0, 72)}`;
      exec(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, cloneDir);

      // 5. Push
      metadata.set("progress", { step: "Pushing to GitHub", percentage: 70 });
      exec(`git push origin ${branchName}`, cloneDir);
      logger.info("Pushed to GitHub", { branchName });

      // 6. Create PR
      metadata.set("progress", { step: "Creating pull request", percentage: 80 });
      const prBody = [
        `## Suggestion for ${toolName}`,
        "",
        `**Submitted by:** ${userName}`,
        "",
        `**Description:** ${description}`,
        "",
        "---",
        "",
        "### Claude's summary",
        "",
        claudeOutput.length > 2000 ? claudeOutput.slice(0, 2000) + "..." : claudeOutput,
      ].join("\n");

      const prResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[Suggestion] ${toolName}: ${description.slice(0, 60)}`,
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

      // 7. Update DB + notify
      metadata.set("progress", { step: "Sending notifications", percentage: 90 });

      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output: `PR #${pr.number} created for ${toolName}`,
          outputUrl: pr.html_url,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      await sendSlackSuggestionNotification({
        type: "pr_created",
        toolId,
        description,
        userName,
        prUrl: pr.html_url,
        branchName,
        runId,
      });

      metadata.set("progress", { step: "Complete", percentage: 100 });

      return { success: true, prUrl: pr.html_url, branchName };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Suggestion failed: ${errorMessage}`, { runId, toolId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackSuggestionNotification({
        type: "failed",
        toolId,
        description,
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
