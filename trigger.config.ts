import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalPackages } from "@trigger.dev/build/extensions/core";
import { playwright } from "@trigger.dev/build/extensions/playwright";

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
    external: ["@anthropic-ai/claude-agent-sdk", "@anthropic-ai/sdk", "postgres", "playwright-core"],
    extensions: [
      additionalPackages({
        packages: ["@seomator/seo-audit", "@anthropic-ai/sdk", "sharp", "cheerio"],
      }),
      playwright({ browsers: ["chromium"] }),
    ],
  },
  machine: "small-2x",
});
