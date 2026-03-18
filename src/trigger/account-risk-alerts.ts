/**
 * Account Risk Alerts — Daily cross-system risk briefing.
 *
 * Runs each weekday at 8:30 AM London (after the knowledge digest at 8/9am).
 * Evaluates every paying account against risk signals from calendar, knowledge,
 * LinkedIn, and actions subsystems. Synthesises a concise Slack DM briefing
 * for team leads using Claude Haiku.
 */

import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { type AccountRiskProfile } from "@/lib/account-risk-signals";
import { getAllAccountRiskProfiles } from "@/lib/account-risk-profiles";
import { sendSlackDM, sendSlackNotification } from "@/lib/slack";

// Same recipients as knowledge digest
const ALERT_RECIPIENTS = [
  "U0ACUKDKYGK", // Tarun Odedra
  "U0AJ4E662G1", // Nitanshu
];

// Haiku pricing as of 2026-03
const INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 4 / 1_000_000;

const anthropic = new Anthropic();

// ---------------------------------------------------------------------------
// LLM briefing generation
// ---------------------------------------------------------------------------

async function generateBriefing(
  profiles: AccountRiskProfile[],
): Promise<{ message: string; cost: number }> {
  const profileSummaries = profiles.map((p) => {
    const signalLines = p.signals
      .map((s) => `  - [${s.severity.toUpperCase()}] ${s.type}: ${s.message}`)
      .join("\n");
    return `Account: ${p.accountName} (${p.mrrCurrency}${p.mrr}/mo, risk: ${p.overallRisk})\n${signalLines}`;
  });

  const prompt = `You are an account health assistant for a B2B agency. Below are accounts with risk signals detected this morning. Generate a concise, prioritised Slack message briefing.

Rules:
- Use Slack mrkdwn formatting (*bold*, _italic_, bullet points)
- Start with a one-line summary (e.g. "🚨 3 accounts need attention today")
- List accounts in priority order (highest risk + highest MRR first)
- For each account: one line with the account name, MRR, and the key risk(s)
- End with 1-2 recommended actions per account (be specific and actionable)
- Keep the entire message under 2000 characters
- Do NOT use markdown code blocks — use plain Slack mrkdwn only

Risk data:
${profileSummaries.join("\n\n")}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cost =
    response.usage.input_tokens * INPUT_COST_PER_TOKEN +
    response.usage.output_tokens * OUTPUT_COST_PER_TOKEN;

  logger.info(
    `Risk briefing LLM: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out, $${cost.toFixed(4)}`,
  );

  return { message: text, cost };
}

// ---------------------------------------------------------------------------
// Slack message construction
// ---------------------------------------------------------------------------

function buildSlackBlocks(briefingText: string, profileCount: number): Record<string, unknown>[] {
  const date = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "⚠️ Account Risk Alerts" },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${date} · ${profileCount} account${profileCount !== 1 ? "s" : ""} flagged`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: briefingText.slice(0, 3000) },
    },
  ];
}

// ---------------------------------------------------------------------------
// Core run logic (shared between scheduled and on-demand)
// ---------------------------------------------------------------------------

async function runRiskAlerts(): Promise<{
  totalAccounts: number;
  atRiskAccounts: number;
  cost: number;
}> {
  const allProfiles = await getAllAccountRiskProfiles();
  logger.info(`Evaluated ${allProfiles.length} paying accounts`);

  // Filter to medium+ risk
  const atRisk = allProfiles.filter((p) => p.overallRisk === "medium" || p.overallRisk === "high");

  if (atRisk.length === 0) {
    logger.info("No at-risk accounts found — skipping Slack notification");
    return { totalAccounts: allProfiles.length, atRiskAccounts: 0, cost: 0 };
  }

  logger.info(`${atRisk.length} account(s) at risk — generating briefing`);

  const { message: briefingText, cost } = await generateBriefing(atRisk);
  const blocks = buildSlackBlocks(briefingText, atRisk.length);
  const fallbackText = `⚠️ Account Risk Alerts — ${atRisk.length} account(s) need attention`;

  for (const recipientId of ALERT_RECIPIENTS) {
    try {
      await sendSlackDM(recipientId, fallbackText, blocks);
      logger.info(`Risk alert sent to ${recipientId}`);
    } catch (err) {
      logger.error(`Failed to send risk alert to ${recipientId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`Risk alerts complete: ${atRisk.length} at-risk accounts, LLM cost $${cost.toFixed(4)}`);

  return { totalAccounts: allProfiles.length, atRiskAccounts: atRisk.length, cost };
}

// ---------------------------------------------------------------------------
// Scheduled task — weekdays 8:30 AM London
// ---------------------------------------------------------------------------

export const accountRiskAlertsSchedule = schedules.task({
  id: "account-risk-alerts-schedule",
  cron: { pattern: "30 8 * * 1-5", timezone: "Europe/London" },
  maxDuration: 300,
  run: async (_payload, { ctx }) => {
    logger.info("Running scheduled account risk alerts");

    try {
      return await runRiskAlerts();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "account-risk-alerts-schedule",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// On-demand task
// ---------------------------------------------------------------------------

export const accountRiskAlertsOnDemand = task({
  id: "account-risk-alerts-on-demand",
  maxDuration: 300,
  run: async (_payload: Record<string, never>, { ctx }) => {
    logger.info("Running on-demand account risk alerts");

    try {
      return await runRiskAlerts();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "account-risk-alerts-on-demand",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
