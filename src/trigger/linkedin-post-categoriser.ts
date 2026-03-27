/**
 * post-categoriser: Categorises linkedin posts using AI.
 *
 * Scheduled daily at 7am London time. Finds all uncategorised posts
 * with non-empty content and classifies them using Claude Haiku.
 *
 * Categories:
 * - thought_leadership
 * - domain_knowledge
 * - third_party_validation
 * - case_study
 * - storytelling
 * - other
 */

import { schedules, task, logger } from "@trigger.dev/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { linkedinPosts } from "@/lib/schema";
import { eq, isNull, and, ne } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";

const VALID_CATEGORIES = [
  "thought_leadership",
  "domain_knowledge",
  "third_party_validation",
  "case_study",
  "storytelling",
  "other",
] as const;

type PostCategory = (typeof VALID_CATEGORIES)[number];

const BATCH_SIZE = 30;

const CATEGORISATION_PROMPT = `You are a LinkedIn content strategist. Classify each LinkedIn post into exactly ONE of these categories:

- thought_leadership: Posts sharing bold opinions, predictions, or frameworks about industry trends. Posts that position the author as a visionary or expert with a unique point of view.
- domain_knowledge: Posts teaching or explaining technical concepts, processes, or practical knowledge. Educational content that demonstrates expertise.
- third_party_validation: Posts referencing, reposting, or commenting on content from other people, companies, or publications. Posts that use external sources to validate a point.
- case_study: Posts describing specific client work, project outcomes, or results achieved. Concrete examples of work done.
- storytelling: Posts about personal experiences, company milestones, team updates, hiring, fundraising, office life, or narrative-driven content.
- other: Posts that don't fit the above categories (guides, interviews, webinars, polls, announcements without narrative).

You will receive a JSON array of objects with "id" and "content" fields.

Return a JSON array of objects with "id" and "category" fields. Use ONLY the category values listed above. Return ONLY the JSON array, no other text.`;

const anthropic = new Anthropic();

async function categoriseBatch(
  posts: Array<{ id: string; content: string }>
): Promise<Array<{ id: string; category: PostCategory }>> {
  const input = posts.map((p) => ({
    id: p.id,
    content: p.content.slice(0, 500),
  }));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${CATEGORISATION_PROMPT}\n\n${JSON.stringify(input)}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let jsonStr = text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    jsonStr = fenced[1];
  } else {
    const bare = text.match(/\[[\s\S]*\]/);
    if (bare) jsonStr = bare[0];
  }

  const results: Array<{ id: string; category: string }> = JSON.parse(jsonStr);

  return results
    .filter((r) => VALID_CATEGORIES.includes(r.category as PostCategory))
    .map((r) => ({ id: r.id, category: r.category as PostCategory }));
}

// ---------------------------------------------------------------------------
// Worker task (can be triggered manually)
// ---------------------------------------------------------------------------

export const postCategoriserTask = task({
  id: "post-categoriser",
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async (_payload: Record<string, never>, { ctx }) => {
    try {
      const uncategorised = await db
        .select({ id: linkedinPosts.id, content: linkedinPosts.content })
        .from(linkedinPosts)
        .where(and(isNull(linkedinPosts.category), ne(linkedinPosts.content, "")));

      if (uncategorised.length === 0) {
        logger.info("No uncategorised posts found");
        return { categorised: 0, total: 0 };
      }

      logger.info(`Found ${uncategorised.length} uncategorised posts`);

      let categorised = 0;

      for (let i = 0; i < uncategorised.length; i += BATCH_SIZE) {
        const batch = uncategorised.slice(i, i + BATCH_SIZE);
        logger.info(
          `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uncategorised.length / BATCH_SIZE)} (${batch.length} posts)`
        );

        const results = await categoriseBatch(batch);

        for (const result of results) {
          await db.update(linkedinPosts).set({ category: result.category }).where(eq(linkedinPosts.id, result.id));
        }

        categorised += results.length;
      }

      logger.info(`Categorised ${categorised}/${uncategorised.length} posts`);
      return { categorised, total: uncategorised.length };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "post-categoriser",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// Scheduler — daily at 7am London time
// ---------------------------------------------------------------------------

export const postCategoriserScheduler = schedules.task({
  id: "post-categoriser-scheduler",
  cron: {
    pattern: "15 7 * * *",
    timezone: "Europe/London",
  },
  run: async (_payload, { ctx }) => {
    try {
      const handle = await postCategoriserTask.trigger({});
      logger.info(`Triggered post-categoriser task: ${handle.id}`);
      return { triggered: true, runId: handle.id };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendSlackNotification({
        tool: "post-categoriser-scheduler",
        userName: "system",
        error: errMsg,
        runId: ctx.run.id,
      });
      throw err;
    }
  },
});
