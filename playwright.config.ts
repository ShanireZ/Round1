import os from "node:os";
import path from "node:path";
import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

const htmlReportOutputFolder = path.join(os.tmpdir(), "round1-playwright-report");
const reporter: ReporterDescription[] =
  process.env.PLAYWRIGHT_HTML_REPORT === "1"
    ? [["list"], ["html", { open: "never", outputFolder: htmlReportOutputFolder }]]
    : [["list"]];

export default defineConfig({
  testDir: "./server/__tests__/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter,
  use: {
    baseURL: "https://127.0.0.1:4399",
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev --workspace=client -- --host 127.0.0.1 --port 4399",
    url: "https://127.0.0.1:4399",
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 120_000,
  },
});
