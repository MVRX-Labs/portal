import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";
import { AI_TELL_VOCABULARY } from "@/lib/humanisation";

const AI_TELL_LIST = AI_TELL_VOCABULARY.join(", ");

function buildPrompt(threadContent: string, outputFormat?: string): string {
  let prompt = `You will convert a Twitter thread (or single tweet) into a LinkedIn post. The LinkedIn post should expand on the thread's ideas while matching the author's voice and maintaining the core message.

# Your rules

- Expand the content: Twitter threads are compressed. LinkedIn allows more space. Add context, nuance, and depth that the 280-char limit forced out.
- Maintain the author's voice. If the thread is casual, keep it casual. If it's data-driven, keep the numbers.
- Structure for LinkedIn: short paragraphs (1-3 sentences), generous white space, hook in the first 2-3 lines
- The first 2-3 lines are everything on LinkedIn — mobile truncates early. Open with the strongest insight or most provocative idea from the thread.
- No bullet lists unless the original thread used numbered points
- Write in first person — the author is sharing their own experience/insight
- End with something that invites conversation: a question, a challenge, a vulnerable admission

# Hard rules

- NEVER use em dashes (\u2014). Use commas, periods, or colons instead.
- NEVER use these AI-flagged words: ${AI_TELL_LIST}
- No emojis or hashtags unless the original thread used them (LinkedIn hashtags at the end are OK if they add value)
- No "I'm thrilled to announce" or any corporate-speak
- No "In today's fast-paced world" or any generic openers
- No company pitching — the post sells the idea, not the company
- Do NOT start consecutive sentences with the same word

# LinkedIn formatting

- 150-300 words (the sweet spot for engagement)
- Short paragraphs: 1-3 sentences max
- White space between paragraphs
- Hook must work in the first 2-3 lines (before "see more" truncation)
- Soft CTA at the end — conversational, not formulaic

# The thread to convert

${threadContent}

# Your process

1. Read the thread and identify the single core insight or story
2. Note the author's voice: formal? casual? data-driven? storytelling?
3. Expand the compressed Twitter ideas into fuller LinkedIn paragraphs
4. Write the LinkedIn post. Stay close to the original tone and style.
5. Review: does it sound like the same person wrote it? If the thread was casual, is the LinkedIn post also casual?

Return ONLY the LinkedIn post — no commentary, no explanations, no labels.`;

  if (outputFormat === "short") {
    prompt += `\n\n# IMPORTANT: Output format override\n\nKeep the post SHORT — under 150 words. This should be a punchy, concise LinkedIn post, not an essay. Get to the point fast.`;
  }

  return prompt;
}

interface TwitterToLinkedInPayload {
  runId: string;
  postContent: string;
  model?: string;
  outputFormat?: string;
}

export const twitterToLinkedinTask = task({
  id: "twitter-to-linkedin",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: TwitterToLinkedInPayload, { signal }) => {
    const { runId, postContent, model, outputFormat } = payload;

    try {
      metadata.set("progress", {
        step: "Converting thread to LinkedIn post",
        stepNumber: 1,
        totalSteps: 2,
        percentage: 10,
      });

      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);
      logger.info("Starting Twitter-to-LinkedIn conversion", { runId, model: resolvedModel });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";

      for await (const message of query({
        prompt: buildPrompt(postContent, outputFormat),
        options: {
          model: resolvedModel,
          abortController,
          allowedTools: [],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 25,
          persistSession: false,
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("text" in block && block.text) {
              const preview = block.text.length > 150 ? block.text.slice(0, 150) + "..." : block.text;
              logger.info(`Claude: ${preview}`);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            logger.info(`Claude finished: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`);
          } else {
            const msg = message as any;
            const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
            throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
          }
        }
      }

      metadata.set("progress", { step: "Complete", stepNumber: 2, totalSteps: 2, percentage: 100 });

      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("Twitter-to-LinkedIn completed", { runId, outputLength: output.length });

      return { success: true, output };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Twitter-to-LinkedIn failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "twitter-to-linkedin",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
