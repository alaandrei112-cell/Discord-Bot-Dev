import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir: "/tmp/moderation-browser-results",
  use: {
    baseURL: process.env.MODERATION_TEST_URL || "http://127.0.0.1:80",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] },
    screenshot: "only-on-failure",
  },
});