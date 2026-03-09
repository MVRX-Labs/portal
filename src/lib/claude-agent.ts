import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "@trigger.dev/sdk/v3";

interface RunClaudeAgentOptions {
  allowedTools: string[];
  maxTurns: number;
  model?: string;
}

interface RunClaudeAgentResult {
  output: string;
  costUsd: number;
  durationMs: number;
  turns: number;
}

export async function runClaudeAgent(
  prompt: string,
  cwd: string,
  opts: RunClaudeAgentOptions
): Promise<RunClaudeAgentResult> {
  let output = "";
  let costUsd = 0;
  let durationMs = 0;
  let turns = 0;

  for await (const message of query({
    prompt,
    options: {
      model: opts.model || "claude-opus-4-6",
      cwd,
      allowedTools: opts.allowedTools,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: opts.maxTurns,
      persistSession: false,
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("name" in block) {
          logger.info(`Tool call: ${(block as any).name}`);
        }
      }
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        output = message.result;
        costUsd = message.total_cost_usd;
        durationMs = message.duration_ms;
        turns = message.num_turns;
      } else {
        const msg = message as any;
        const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
        throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
      }
    }
  }

  return { output, costUsd, durationMs, turns };
}
