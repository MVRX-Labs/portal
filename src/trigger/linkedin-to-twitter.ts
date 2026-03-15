import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";
import { TWITTER_PROMPT_PRESETS, resolvePromptTemplate } from "@/lib/twitter-prompts";

function buildPrompt(
  postContent: string,
  promptStyle?: string,
  customPrompt?: string,
  outputFormat?: string,
  callToAction?: string
): string {
  let prompt: string;
  if (customPrompt && customPrompt.trim()) {
    prompt = resolvePromptTemplate(customPrompt, postContent);
  } else {
    const preset = TWITTER_PROMPT_PRESETS[promptStyle || "default"] || TWITTER_PROMPT_PRESETS.default;
    prompt = resolvePromptTemplate(preset.template, postContent);
  }

  if (outputFormat === "single-tweet") {
    prompt += `\n\n# IMPORTANT: Output format override

Do NOT write a thread. Write a SINGLE tweet only (max 280 characters). Condense the key insight from the post into one punchy, self-contained tweet. No "TWEET 1", no numbering, no thread indicators. Just one tweet.`;
  }

  if (callToAction?.trim()) {
    prompt += `\n\n# Call to action

End the ${outputFormat === "single-tweet" ? "tweet" : "thread"} with this call to action (weave it in naturally): ${callToAction.trim()}`;
  }

  return prompt;
}

interface LinkedInToTwitterPayload {
  runId: string;
  postContent: string;
  model?: string;
  promptStyle?: string;
  customPrompt?: string;
  outputFormat?: string;
  callToAction?: string;
}

export const linkedinToTwitterTask = task({
  id: "linkedin-to-twitter",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: LinkedInToTwitterPayload, { signal }) => {
    const { runId, postContent, model, promptStyle, customPrompt, outputFormat, callToAction } = payload;

    try {
      metadata.set("progress", {
        step: "Converting post to tweets",
        stepNumber: 1,
        totalSteps: 2,
        percentage: 10,
      });

      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);
      const usedStyle = customPrompt?.trim() ? "custom" : promptStyle || "default";
      logger.info("Starting LinkedIn-to-Twitter conversion", { runId, model: resolvedModel, promptStyle: usedStyle });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";

      for await (const message of query({
        prompt: buildPrompt(postContent, promptStyle, customPrompt, outputFormat, callToAction),
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

      logger.info("LinkedIn-to-Twitter completed", { runId, outputLength: output.length });

      return { success: true, output };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`LinkedIn-to-Twitter failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "linkedin-to-twitter",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
