import { writeFileSync } from "fs";
import { buildGrowthReportDocx } from "../src/lib/growth-report/builder";
import { placeholderReport } from "../src/lib/growth-report/placeholder-data";

async function main() {
  console.log("Generating sample growth report...");
  const buffer = await buildGrowthReportDocx(placeholderReport);
  const outPath = "sample-growth-report.docx";
  writeFileSync(outPath, buffer);
  console.log(`Done! Written to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
