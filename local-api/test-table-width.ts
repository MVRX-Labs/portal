import { writeFile } from "fs/promises";
import { buildAuditDocx } from "./src/lib/audit-docx-builder.js";
import type { LinkedInAuditContent } from "./src/lib/audit-schema.js";

const testContent: LinkedInAuditContent = {
  personName: "Test Person",
  personTitle: "CEO at TestCo",
  linkedinSlug: "test-person",
  preparedDate: "February 2026",
  executiveSummary: [
    "This is a test executive summary paragraph to verify table rendering.",
  ],
  overallScore: 42,
  verdict: "The profile needs significant improvement across multiple areas.",
  scorecard: [
    { category: "Headline", score: 3, assessment: "Generic headline with no value proposition" },
    { category: "About Section", score: 5, assessment: "Decent but could be more compelling" },
    { category: "Experience", score: 7, assessment: "Well-documented career history" },
    { category: "Profile Photo", score: 8, assessment: "Professional headshot" },
    { category: "Banner Image", score: 2, assessment: "Default LinkedIn banner" },
  ],
  sections: [
    {
      title: "Content Strategy Audit",
      subsections: [
        {
          title: "Posting Frequency",
          content: [
            { type: "paragraph", text: "Here is the posting data:" },
            {
              type: "table",
              headers: ["Month", "Posts", "Avg Likes", "Avg Comments"],
              rows: [
                ["January 2026", "4", "23", "5"],
                ["December 2025", "2", "15", "3"],
                ["November 2025", "1", "8", "1"],
              ],
            },
          ],
        },
      ],
    },
    {
      title: "2-Week Content Calendar",
      content: [
        { type: "paragraph", text: "Suggested content plan:" },
        {
          type: "table",
          headers: ["Day", "Topic", "Format", "Hook"],
          rows: [
            ["Monday", "Industry trends", "Carousel", "Did you know that..."],
            ["Wednesday", "Case study", "Long post", "Here's how we helped..."],
            ["Friday", "Personal insight", "Short post", "One lesson I learned..."],
            ["Sunday", "Engagement post", "Poll", "What's your take on..."],
          ],
        },
      ],
    },
  ],
};

async function main() {
  const buf = await buildAuditDocx(testContent);
  const path = "test-output.docx";
  await writeFile(path, buf);
  console.log(`Written ${(buf.length / 1024).toFixed(0)} KB to ${path}`);
}

main().catch(console.error);
