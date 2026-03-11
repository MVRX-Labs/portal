/**
 * Test each Apify scraper individually to diagnose failures.
 * Usage: npx tsx scripts/test-scrapers.ts [name]  (reads .env.local)
 * Names: similarweb, ahrefs, seo-audit, reddit, serp, trustpilot
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const APIFY_BASE = "https://api.apify.com/v2";

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) throw new Error("Missing APIFY_API_TOKEN env var");
  return t;
}

async function testActor(label: string, actorId: string, input: unknown) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${label}`);
  console.log(`Actor: ${actorId}`);
  console.log(`Input: ${JSON.stringify(input).slice(0, 300)}`);
  console.log(`${"=".repeat(60)}`);

  const encodedId = actorId.includes("/") ? actorId.replace("/", "~") : actorId;
  const url = `${APIFY_BASE}/acts/${encodedId}/run-sync-get-dataset-items?token=${token()}`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`FAILED (${res.status}) in ${elapsed}s`);
      console.log(`Response: ${body.slice(0, 500)}`);
      return;
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];
    console.log(`SUCCESS in ${elapsed}s — ${items.length} item(s)`);
    if (items[0]) {
      console.log(`Keys: ${Object.keys(items[0]).join(", ")}`);
      console.log(`Sample: ${JSON.stringify(items[0]).slice(0, 800)}`);
    }
  } catch (err: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`ERROR in ${elapsed}s: ${err.message}`);
  }
}

const TEST_SITE = "healf.com";
const TEST_COMPANY = "Healf";

async function main() {
  const which = process.argv[2];
  console.log(`Testing scrapers... ${which ? `(only: ${which})` : "(all)"}\n`);

  if (!which || which === "similarweb") {
    await testActor("SimilarWeb (ecomdate)", "ecomdate/similarweb-scraper", {
      domains: [TEST_SITE],
    });
  }

  if (!which || which === "ahrefs") {
    await testActor("Ahrefs (radeance)", "radeance/ahrefs-scraper", {
      urls: [`https://${TEST_SITE}`],
      searchMode: "domain_overview",
    });
  }

  if (!which || which === "seo-audit") {
    await testActor("SEO Audit", "UFSUQD7pWNwN3jExC", {
      startUrls: [{ url: `https://${TEST_SITE}` }],
      maxPagesPerCrawl: 5,
    });
  }

  if (!which || which === "reddit") {
    await testActor("Reddit Lite (trudax)", "trudax/reddit-scraper-lite", {
      searches: [TEST_COMPANY],
      maxItems: 5,
      sort: "relevance",
      time: "all",
    });
  }

  if (!which || which === "serp") {
    await testActor("Google SERP", "nFJndFXA5zjCTuudP", {
      queries: `${TEST_COMPANY} supplements`,
      maxPagesPerQuery: 1,
      resultsPerPage: 5,
    });
  }

  if (!which || which === "trustpilot") {
    await testActor("Trustpilot", "casper11515/trustpilot-reviews-scraper", {
      urls: [`https://www.trustpilot.com/review/${TEST_SITE}`],
      maxReviews: 3,
    });
  }

  console.log("\n\nDone.");
}

main().catch(console.error);
