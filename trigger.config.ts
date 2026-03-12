import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalPackages } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_omchykblaxtcsrpezhql",
  runtime: "node",
  logLevel: "log",
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    external: ["@anthropic-ai/claude-agent-sdk", "@anthropic-ai/sdk", "postgres"],
    extensions: [
      additionalPackages({
        packages: ["@seomator/seo-audit", "@anthropic-ai/sdk"],
      }),
    ],
  },
  machine: "small-2x",
});
