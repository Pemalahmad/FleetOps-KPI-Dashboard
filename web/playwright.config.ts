import { defineConfig, devices } from "@playwright/test";

// Security end-to-end tests against the production build (npm run build first).
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: "http://127.0.0.1:4310", ...devices["Desktop Chrome"], serviceWorkers: "block" },
  webServer: { command: "node e2e/serve.mjs out 4310", url: "http://127.0.0.1:4310/", reuseExistingServer: !process.env.CI },
});
