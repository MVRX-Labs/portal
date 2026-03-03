import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";

interface SystemTestPayload {
  runId: string;
  model?: string;
}

export const systemTestTask = task({
  id: "system-test",
  maxDuration: 120,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: SystemTestPayload, { signal }) => {
    const { runId, model } = payload;

    try {
      metadata.set("progress", { step: "Running system test", stepNumber: 1, totalSteps: 1, percentage: 10 });

      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);
      logger.info("Starting system test", { runId, model: resolvedModel });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";

      for await (const message of query({
        prompt: "Write a short haiku about software testing. Return only the haiku, nothing else.",
        options: {
          model: resolvedModel,
          abortController,
          allowedTools: [],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 2,
          persistSession: false,
        },
      })) {
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

      metadata.set("progress", { step: "Complete", stepNumber: 1, totalSteps: 1, percentage: 100 });

      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("System test completed", { runId });

      return { success: true, output };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`System test failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "system-test",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
