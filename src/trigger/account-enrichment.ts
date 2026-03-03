import { task, logger } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";

interface EnrichmentPayload {
  accountId: string;
  domain: string;
}

interface EnrichmentResult {
  companyName: string;
  industry?: string;
  website?: string;
  linkedinUrl?: string;
}

const ENRICHMENT_PROMPT = (domain: string) => `\
You are a research assistant. Your job is to find the correct company details for the domain "${domain}".

Use WebSearch and WebFetch to research this domain and find:
1. The correct, official company name (not the domain name). For example, "withsutro.com" should be "Sutro", not "Withsutro".
2. The company's industry (e.g. "SaaS", "Fintech", "Healthcare", etc.)
3. The canonical company website URL (may differ from the email domain)
4. The company's LinkedIn page URL if you can find it

IMPORTANT:
- The domain "${domain}" may be a vanity domain, product domain, or shortened brand name. Look up what the ACTUAL company name is.
- Visit the website at https://${domain} using WebFetch to see what the company calls itself.
- Search the web for "${domain}" to find more information.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "companyName": "The Official Company Name",
  "industry": "Industry Category",
  "website": "https://example.com",
  "linkedinUrl": "https://linkedin.com/company/example"
}

If you cannot find a LinkedIn URL, omit that field. All other fields are required.
`;

function extractJSON(text: string): string | null {
  // Try to find JSON in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : null;
}

export const accountEnrichmentTask = task({
  id: "account-enrichment",
  queue: {
    name: "account-enrichment",
    concurrencyLimit: 2,
  },
  maxDuration: 120,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 3000,
  },
  run: async (payload: EnrichmentPayload) => {
    const { accountId, domain } = payload;

    logger.info(`Enriching account ${accountId} for domain ${domain}`);

    // Verify the account still exists and is auto-created
    const [account] = await db
      .select({ id: accounts.id, autoCreated: accounts.autoCreated, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account) {
      logger.warn(`Account ${accountId} not found, skipping enrichment`);
      return { skipped: true, reason: "not_found" };
    }

    if (!account.autoCreated) {
      logger.info(`Account ${accountId} is not auto-created, skipping enrichment`);
      return { skipped: true, reason: "not_auto_created" };
    }

    const sessionDir = join(tmpdir(), `enrich-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });

    try {
      let output = "";

      for await (const message of query({
        prompt: ENRICHMENT_PROMPT(domain),
        options: {
          model: "claude-haiku-4-5-20251001",
          cwd: sessionDir,
          allowedTools: ["WebSearch", "WebFetch"],
          maxTurns: 10,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
        },
      })) {
        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            logger.info(
              `Enrichment completed: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`,
            );
          } else {
            const errorMsg = message.errors.join("; ") || message.subtype;
            logger.error(`Enrichment failed: ${errorMsg}`);
            return { error: errorMsg };
          }
        }
      }

      // Parse the result
      const jsonStr = extractJSON(output);
      if (!jsonStr) {
        logger.warn(`Could not extract JSON from enrichment output: ${output.slice(0, 500)}`);
        return { error: "no_json_in_output", rawOutput: output.slice(0, 500) };
      }

      let result: EnrichmentResult;
      try {
        result = JSON.parse(jsonStr);
      } catch {
        logger.warn(`Failed to parse enrichment JSON: ${jsonStr.slice(0, 500)}`);
        return { error: "invalid_json", rawOutput: jsonStr.slice(0, 500) };
      }

      if (!result.companyName) {
        logger.warn("Enrichment returned no company name");
        return { error: "no_company_name", result };
      }

      // Update the account with enriched data
      const updates: Record<string, unknown> = {
        name: result.companyName,
        updatedAt: new Date(),
      };

      if (result.industry) updates.industry = result.industry;
      if (result.website) updates.website = result.website;
      if (result.linkedinUrl) updates.linkedinUrl = result.linkedinUrl;

      await db.update(accounts).set(updates).where(eq(accounts.id, accountId));

      logger.info(
        `Enriched account ${accountId}: "${account.name}" -> "${result.companyName}"`,
      );

      return {
        accountId,
        previousName: account.name,
        enrichedName: result.companyName,
        industry: result.industry,
        website: result.website,
        linkedinUrl: result.linkedinUrl,
      };
    } finally {
      await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    }
  },
});
