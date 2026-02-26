import { Router } from "express";
import { spawn } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const router = Router();

interface ClaudeRequest {
  prompt: string;
  files?: Record<string, string>; // filename -> text content
  binaryFiles?: Record<string, string>; // filename -> base64-encoded content
  maxTurns?: number;
}

router.post("/", async (req, res) => {
  const { prompt, files, binaryFiles, maxTurns: inputMaxTurns } = req.body as ClaudeRequest;

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const maxTurns = inputMaxTurns ?? 0 + 100; // for resting

  const sessionDir = join(tmpdir(), `claude-session-${randomUUID()}`);

  try {
    await mkdir(sessionDir, { recursive: true });

    if (files && Object.keys(files).length > 0) {
      for (const [filename, content] of Object.entries(files)) {
        const filePath = join(sessionDir, filename);
        const fileDir = join(sessionDir, filename.split("/").slice(0, -1).join("/"));
        if (fileDir !== sessionDir) {
          await mkdir(fileDir, { recursive: true });
        }
        await writeFile(filePath, content, "utf-8");
      }
    }

    if (binaryFiles && Object.keys(binaryFiles).length > 0) {
      for (const [filename, base64Content] of Object.entries(binaryFiles)) {
        const filePath = join(sessionDir, filename);
        const fileDir = join(sessionDir, filename.split("/").slice(0, -1).join("/"));
        if (fileDir !== sessionDir) {
          await mkdir(fileDir, { recursive: true });
        }
        await writeFile(filePath, Buffer.from(base64Content, "base64"));
      }
    }

    const args = ["--print", "--output-format", "text", "--verbose"];

    if (maxTurns) {
      args.push("--max-turns", String(maxTurns));
    }

    args.push(prompt);

    const output = await runClaude(args, sessionDir);

    res.json({ output });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Claude session failed:", message);
    res.status(500).json({ error: message });
  } finally {
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
});

function runClaude(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (data) => chunks.push(data));
    proc.stderr.on("data", (data) => errChunks.push(data));

    proc.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      const stderr = Buffer.concat(errChunks).toString("utf-8");

      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr || stdout}`));
        return;
      }

      resolve(stdout);
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

export default router;
