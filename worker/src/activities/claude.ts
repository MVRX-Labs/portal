import { heartbeat } from "@temporalio/activity";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

export interface ClaudeAgentInput {
  prompt: string;
  model: string;
  maxTurns: number;
  allowedTools: string[];
  setupFiles?: Record<string, string>;
}

export async function runClaudeAgent(input: ClaudeAgentInput): Promise<string> {
  const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);

  try {
    await mkdir(sessionDir, { recursive: true });

    if (input.setupFiles) {
      for (const [name, content] of Object.entries(input.setupFiles)) {
        await writeFile(join(sessionDir, name), content, "utf-8");
      }
      console.log(`[claude] Wrote ${Object.keys(input.setupFiles).length} setup files`);
    }

    console.log(`[claude] Starting agent (model: ${input.model}, maxTurns: ${input.maxTurns})...`);
    const start = Date.now();
    let output = "";

    const heartbeatInterval = setInterval(() => heartbeat(), 20_000);

    try {
      for await (const message of query({
        prompt: input.prompt,
        options: {
          model: input.model,
          cwd: sessionDir,
          allowedTools: input.allowedTools,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: input.maxTurns,
          persistSession: false,
        },
      })) {
        heartbeat();

        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("name" in block) {
              console.log(`[claude] Tool call: ${block.name}`);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            const cost = message.total_cost_usd.toFixed(4);
            console.log(
              `[claude] Done: ${message.num_turns} turns | $${cost} | ${message.duration_ms}ms`,
            );
          } else {
            const msg = message as { subtype?: string; errors?: string[] };
            const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
            throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
          }
        }
      }
    } finally {
      clearInterval(heartbeatInterval);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[claude] Finished in ${elapsed}s (${output.length} chars)`);

    return output;
  } finally {
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
}
