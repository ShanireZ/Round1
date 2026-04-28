import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

const htmlReportOutputFolder = path.join(os.tmpdir(), "round1-playwright-report");
const hasLocalHttpsCert =
  fs.existsSync(path.join(process.cwd(), "certs", "dev-cert.pem")) &&
  fs.existsSync(path.join(process.cwd(), "certs", "dev-key.pem"));
const clientDevOrigin = `${hasLocalHttpsCert ? "https" : "http"}://127.0.0.1:4399`;
const browserChannel = process.env.ROUND1_PLAYWRIGHT_BROWSER_CHANNEL;
const chromiumProjectUse =
  browserChannel === "chrome" || browserChannel === "msedge"
    ? { ...devices["Desktop Chrome"], channel: browserChannel }
    : { ...devices["Desktop Chrome"] };
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
    baseURL: clientDevOrigin,
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: browserChannel ?? "chromium", use: chromiumProjectUse }],
  webServer: {
    command: "npm run dev --workspace=client -- --host 127.0.0.1 --port 4399",
    url: clientDevOrigin,
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 120_000,
  },
});
