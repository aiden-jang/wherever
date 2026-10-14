import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const port = 34501;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", serviceWorkers: "block" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../worker", import.meta.url)),
    command: `pnpm exec wrangler d1 migrations apply wherever --local --persist-to .wrangler/e2e && pnpm exec wrangler dev --ip 127.0.0.1 --port ${port} --inspector-port 34502 --persist-to .wrangler/e2e --var RESTAURANT_SOURCE:mock`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { WRANGLER_LOG_PATH: "../../.wrangler/e2e-logs/" },
  },
});
