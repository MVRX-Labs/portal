/**
 * lead-scoring-batch: Scores unscored leads against ICP definitions using Claude.
 *
 * Triggered automatically after new leads are upserted, or manually via the
 * "Score Leads" button in the UI. Sends Slack DMs for newly scored Tier-1 leads.
 */

import { task, logger, queue } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { leads, icpDefinitions, accounts, users } from "@/lib/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { scoreLeadAgainstIcp } from "@/lib/lead-enrichment";
import { sendSlackNotification, sendSlackDM } from "@/lib/slack";

const scoringQueue = queue({
  name: "lead-scoring",
  concurrencyLimit: 2,
});

interface LeadScoringPayload {
  accountId: string;
  leadIds?: string[];
}

interface ScoredLead {
  id: string;
  firstName: string;
  lastName: string | null;
  company: string | null;
  headline: string | null;
  engagementTypes: string[];
  tier: number;
  conversionPct: number;
  rationale: string;
}

export const leadScoringBatchTask = task({
  id: "lead-scoring-batch",
  queue: scoringQueue,
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (payload: LeadScoringPayload, { ctx }) => {
    const { accountId, leadIds } = payload;

    try {
      const activeIcps = await db
        .select()
        .from(icpDefinitions)
        .where(and(eq(icpDefinitions.accountId, accountId), eq(icpDefinitions.active, true)));

      if (activeIcps.length === 0) {
        logger.info(`No active ICP definitions for account ${accountId}, skipping scoring`);
        return { scored: 0, totalCost: 0 };
      }

      const unscoredLeads = await loadLeadsToScore(accountId, leadIds);

      if (unscoredLeads.length === 0) {
        logger.info(`No unscored leads for account ${accountId}`);
        return { scored: 0, totalCost: 0 };
      }

      logger.info(`Scoring ${unscoredLeads.length} leads against ${activeIcps.length} ICP(s)`);

      let totalCost = 0;
      const tier1Leads: ScoredLead[] = [];

      for (const lead of unscoredLeads) {
        const bestResult = await scoreBestIcp(lead, activeIcps);
        totalCost += bestResult.cost;

        await db
          .update(leads)
          .set({
            tier: bestResult.tier,
            conversionPct: bestResult.conversionPct,
            rationale: bestResult.rationale,
            enrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(leads.id, lead.id));

        if (bestResult.tier === 1) {
          tier1Leads.push({
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            company: lead.company,
            headline: lead.headline,
            engagementTypes: (lead.engagementTypes as string[]) || [],
            tier: bestResult.tier,
            conversionPct: bestResult.conversionPct,
            rationale: bestResult.rationale,
          });
        }
      }

      logger.info(
        `Scored ${unscoredLeads.length} leads (${tier1Leads.length} T1). Total cost: $${totalCost.toFixed(4)}`
      );

      if (tier1Leads.length > 0) {
        await sendTier1Alerts(accountId, tier1Leads);
      }

      return { scored: unscoredLeads.length, tier1: tier1Leads.length, totalCost };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Lead scoring failed", { error: errorMessage });

      await sendSlackNotification({
        tool: "lead-scoring-batch",
        userName: "trigger-task",
        error: errorMessage,
        runId: ctx.run.id,
      }).catch(() => {});

      throw err;
    }
  },
});

async function loadLeadsToScore(accountId: string, leadIds?: string[]) {
  if (leadIds && leadIds.length > 0) {
    return db
      .select()
      .from(leads)
      .where(and(eq(leads.accountId, accountId), inArray(leads.id, leadIds)));
  }
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.accountId, accountId), isNull(leads.tier)));
}

async function scoreBestIcp(
  lead: typeof leads.$inferSelect,
  icps: (typeof icpDefinitions.$inferSelect)[]
) {
  let bestTier = 3;
  let bestConversion = 0;
  let bestRationale = "No ICP match found.";
  let totalCost = 0;

  const leadData = {
    firstName: lead.firstName,
    lastName: lead.lastName,
    headline: lead.headline,
    company: lead.company,
    title: lead.title,
    division: lead.division,
    engagementTypes: (lead.engagementTypes as string[]) || [],
    engagementPosts: (lead.engagementPosts as string[]) || [],
  };

  for (const icp of icps) {
    const icpData = {
      name: icp.name,
      description: icp.description,
      targetTitles: (icp.targetTitles as string[]) || [],
      targetIndustries: (icp.targetIndustries as string[]) || [],
      targetCompanySizes: (icp.targetCompanySizes as string[]) || [],
      targetSignals: (icp.targetSignals as string[]) || [],
    };

    const result = await scoreLeadAgainstIcp(leadData, icpData, logger);
    totalCost += result.cost;

    if (result.tier < bestTier || (result.tier === bestTier && result.conversionPct > bestConversion)) {
      bestTier = result.tier;
      bestConversion = result.conversionPct;
      bestRationale = result.rationale;
    }
  }

  return { tier: bestTier, conversionPct: bestConversion, rationale: bestRationale, cost: totalCost };
}

async function sendTier1Alerts(accountId: string, tier1Leads: ScoredLead[]) {
  try {
    const [account] = await db
      .select({ name: accounts.name, ownerId: accounts.ownerId })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) return;

    const slackUserId = await resolveOwnerSlackId(account.ownerId);
    if (!slackUserId) {
      logger.info("No Slack user found for account owner, skipping Tier-1 alerts");
      return;
    }

    const leadLines = tier1Leads.map((l) => {
      const name = `${l.firstName} ${l.lastName || ""}`.trim();
      const types = l.engagementTypes.join(", ");
      return `*${name}*${l.company ? ` at ${l.company}` : ""}\n` +
        `${l.headline || ""}\n` +
        `Engagement: ${types} | Conversion: ${l.conversionPct}%\n` +
        `_${l.rationale}_`;
    });

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎯 *${tier1Leads.length} new Tier-1 lead${tier1Leads.length === 1 ? "" : "s"}* for *${account.name}*`,
        },
      },
      { type: "divider" },
      ...leadLines.map((text) => ({
        type: "section",
        text: { type: "mrkdwn", text },
      })),
    ];

    await sendSlackDM(slackUserId, `${tier1Leads.length} new Tier-1 lead(s) for ${account.name}`, blocks);
    logger.info(`Sent Tier-1 Slack alert for ${tier1Leads.length} leads to ${slackUserId}`);
  } catch (err) {
    logger.error("Failed to send Tier-1 Slack alerts", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function resolveOwnerSlackId(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;

  const token = process.env.SLACKBOT_TOKEN;
  if (!token) return null;

  const [user] = await db
    .select({ email: users.email, slackUserId: users.slackUserId })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  if (!user) return null;
  if (user.slackUserId) return user.slackUserId;

  try {
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(user.email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.ok ? (data.user.id as string) : null;
  } catch {
    return null;
  }
}
