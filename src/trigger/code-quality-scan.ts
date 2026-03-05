import { schedules, logger } from "@trigger.dev/sdk/v3";
import { execSync } from "child_process";

async function sendSlackSummary(findings: string[]) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || findings.length === 0) return;

  const payload = {
    text: "Weekly Code Quality Scan",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [`*Weekly Code Quality Scan*`, `Found ${findings.length} issue(s):`, "", ...findings].join("\n"),
        },
      },
    ],
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const codeQualityScanTask = schedules.task({
  id: "code-quality-scan",
  cron: { pattern: "0 8 * * 1", timezone: "Europe/London" },
  run: async () => {
    const findings: string[] = [];

    // Check for files exceeding 300 lines (catches things that slipped past pre-commit)
    try {
      const longFiles = execSync(
        `find src/ -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 300 && !/total$/ {print $2 " (" $1 " lines)"}'`,
        { encoding: "utf-8", cwd: process.cwd() }
      ).trim();
      if (longFiles) {
        const files = longFiles.split("\n");
        findings.push(`*${files.length} file(s) over 300 lines:*`);
        files.forEach((f) => findings.push(`  - ${f}`));
      }
    } catch {
      logger.warn("Failed to check file lengths");
    }

    // Count TODO/FIXME/HACK comments
    try {
      const todoCount = execSync(
        `grep -r 'TODO\\|FIXME\\|HACK' src/ --include='*.ts' --include='*.tsx' -c 2>/dev/null || echo "0"`,
        {
          encoding: "utf-8",
          cwd: process.cwd(),
        }
      ).trim();
      const total = todoCount.split("\n").reduce((sum, line) => sum + (parseInt(line.split(":").pop() || "0") || 0), 0);
      if (total > 0) {
        findings.push(`*${total} TODO/FIXME/HACK comments* across the codebase`);
      }
    } catch {
      logger.warn("Failed to count TODOs");
    }

    // Run architecture lint
    try {
      execSync("bash scripts/lint-architecture.sh", { encoding: "utf-8", cwd: process.cwd() });
    } catch (e: unknown) {
      const error = e as { stdout?: string };
      findings.push(`*Architecture lint violations:*\n${error.stdout || "See lint output"}`);
    }

    if (findings.length === 0) {
      logger.info("Code quality scan: no issues found");
    } else {
      logger.warn("Code quality scan found issues", { count: findings.length });
      await sendSlackSummary(findings);
    }

    return { findingsCount: findings.length, findings };
  },
});
