import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const CALLBACK_RETRIES = 3;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TURNS = 10;

export function log(runId: string, message: string) {
  const ts = new Date().toISOString().slice(11, 19);
  const shortId = runId.slice(0, 8);
  console.log(`${ts} [job][${shortId}] ${message}`);
}

export interface ClaudeJobConfig {
  runId: string;
  callbackUrl: string;
  apiKey: string;
  prompt: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  setupSession?: (dir: string) => Promise<void>;
}

export async function runClaudeJob(config: ClaudeJobConfig): Promise<void> {
  const {
    runId,
    callbackUrl,
    apiKey,
    prompt,
    model = DEFAULT_MODEL,
    maxTurns = DEFAULT_MAX_TURNS,
    allowedTools = ["Read", "Glob", "Grep"],
    setupSession,
  } = config;

  const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);
  const jobStart = Date.now();

  try {
    log(runId, "Setting up session directory...");
    await mkdir(sessionDir, { recursive: true });

    if (setupSession) {
      await setupSession(sessionDir);
      log(runId, "Session files written.");
    }

    log(runId, "Starting Claude Agent SDK...");
    const claudeStart = Date.now();
    let output = "";

    try {
      for await (const message of query({
        prompt,
        options: {
          model,
          cwd: sessionDir,
          allowedTools,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns,
          persistSession: false,
        },
      })) {
        if (
          message.type === "system" &&
          "subtype" in message &&
          message.subtype === "init"
        ) {
          log(runId, `Session initialized (model: ${message.model})`);
        }

        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("text" in block && block.text) {
              const preview =
                block.text.length > 150
                  ? block.text.slice(0, 150) + "..."
                  : block.text;
              log(runId, `Claude: ${preview}`);
            } else if ("name" in block) {
              log(runId, `Tool call: ${block.name}`);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            const cost = message.total_cost_usd.toFixed(4);
            log(
              runId,
              `Result: success | ${message.num_turns} turns | $${cost} | ${message.duration_ms}ms`
            );
          } else {
            const errors =
              "errors" in message
                ? message.errors.join("; ")
                : message.subtype;
            log(runId, `Result: ${message.subtype} — ${errors}`);
            throw new Error(
              `Claude finished with ${message.subtype}: ${errors}`
            );
          }
        }
      }
    } catch (sdkErr) {
      if (
        sdkErr instanceof Error &&
        sdkErr.message.startsWith("Claude finished with")
      ) {
        throw sdkErr;
      }
      const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      throw new Error(
        `Claude API request failed (likely rate-limited or overloaded): ${msg}`
      );
    }

    const claudeElapsed = ((Date.now() - claudeStart) / 1000).toFixed(1);
    log(runId, `Claude finished in ${claudeElapsed}s (output: ${output.length} chars)`);

    const durationMs = Date.now() - jobStart;
    await sendCallback(callbackUrl, {
      runId,
      status: "completed",
      output,
      durationMs,
      apiKey,
    });

    log(runId, `Job completed successfully in ${(durationMs / 1000).toFixed(1)}s`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - jobStart;
    log(runId, `Job failed after ${(durationMs / 1000).toFixed(1)}s: ${message}`);

    await sendCallback(callbackUrl, {
      runId,
      status: "failed",
      error: message,
      durationMs,
      apiKey,
    });
  } finally {
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function sendCallback(
  callbackUrl: string,
  payload: {
    runId: string;
    status: string;
    output?: string;
    error?: string;
    durationMs?: number;
    apiKey: string;
  }
) {
  log(payload.runId, `Sending callback to ${callbackUrl} (status: ${payload.status})...`);

  for (let attempt = 1; attempt <= CALLBACK_RETRIES; attempt++) {
    try {
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      log(payload.runId, "Callback sent successfully");
      return;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(
        payload.runId,
        `Callback attempt ${attempt}/${CALLBACK_RETRIES} failed: ${errMsg}`
      );

      if (attempt < CALLBACK_RETRIES) {
        const delayMs = attempt * 2000;
        log(payload.runId, `Retrying callback in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  log(
    payload.runId,
    `All ${CALLBACK_RETRIES} callback attempts failed — run will remain stuck as "running"`
  );
}
