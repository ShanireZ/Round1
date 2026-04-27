import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import dotenv from "dotenv";

type CheckStatus = "pass" | "fail" | "skip";

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail: string;
};

type HealthcheckOptions = {
  apiUrl: string;
  frontendUrl: string;
  runnerUrl: string;
  timeoutMs: number;
  includeOffline: boolean;
  includeExternal: boolean;
  checkPm2: boolean;
  expectRuntimeWorker: boolean;
  expectContentWorker: boolean;
  json: boolean;
};

const execFileAsync = promisify(execFile);

function findNearestEnvFile(startDir: string): string | undefined {
  let current = startDir;

  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return undefined;
}

function parseBooleanFlag(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function takeValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/healthcheck.ts [options]

Options:
  --api-url <url>          API health URL. Defaults to http://127.0.0.1:$PORT/api/v1/health.
  --frontend-url <url>     Optional frontend URL to smoke-check.
  --runner-url <url>       Offline cpp-runner health URL. Defaults to $SANDBOX_RUNNER_URL/health.
  --include-offline        Check offline runner health.
  --include-external       Check mail and Turnstile configuration presence.
  --pm2                    Check PM2 process status with "pm2 jlist".
  --expect-runtime-worker  Require round1-runtime-worker to be online in PM2.
  --expect-content-worker  Require round1-content-worker to be online in PM2.
  --timeout-ms <ms>        Per-request timeout. Defaults to 5000.
  --json                   Print JSON.
  --help                   Show this help.`);
}

function parseOptions(): HealthcheckOptions {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const envFile = findNearestEnvFile(path.resolve(import.meta.dirname, ".."));
  if (envFile) {
    dotenv.config({ path: envFile });
  }

  const port = process.env.PORT || "5100";
  const configuredRunner = process.env.SANDBOX_RUNNER_URL || "http://127.0.0.1:6100";
  const runnerUrl = takeValue(args, "--runner-url") ?? `${configuredRunner.replace(/\/$/, "")}/health`;
  const timeoutRaw =
    takeValue(args, "--timeout-ms") ?? process.env.ROUND1_HEALTHCHECK_TIMEOUT_MS ?? "5000";
  const timeoutMs = Number.parseInt(timeoutRaw, 10);

  return {
    apiUrl:
      takeValue(args, "--api-url") ??
      process.env.ROUND1_HEALTHCHECK_API_URL ??
      `http://127.0.0.1:${port}/api/v1/health`,
    frontendUrl: takeValue(args, "--frontend-url") ?? process.env.ROUND1_HEALTHCHECK_FRONTEND_URL ?? "",
    runnerUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
    includeOffline:
      args.includes("--include-offline") ||
      parseBooleanFlag(process.env.ROUND1_HEALTHCHECK_INCLUDE_OFFLINE),
    includeExternal:
      args.includes("--include-external") ||
      parseBooleanFlag(process.env.ROUND1_HEALTHCHECK_INCLUDE_EXTERNAL),
    checkPm2: args.includes("--pm2") || parseBooleanFlag(process.env.ROUND1_HEALTHCHECK_PM2),
    expectRuntimeWorker:
      args.includes("--expect-runtime-worker") ||
      parseBooleanFlag(process.env.ROUND1_PM2_ENABLE_RUNTIME_WORKER),
    expectContentWorker:
      args.includes("--expect-content-worker") ||
      parseBooleanFlag(process.env.ROUND1_PM2_ENABLE_CONTENT_WORKER),
    json: args.includes("--json"),
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkApiHealth(options: HealthcheckOptions): Promise<CheckResult> {
  try {
    const response = await fetchWithTimeout(options.apiUrl, options.timeoutMs);
    const body = (await response.json()) as {
      success?: boolean;
      data?: { status?: string; db?: string; redis?: string };
    };
    const status = body.data?.status;
    const db = body.data?.db ?? "unknown";
    const redis = body.data?.redis ?? "unknown";

    if (response.ok && body.success === true && status === "ok") {
      return { name: "api-readiness", status: "pass", detail: `api ok, db=${db}, redis=${redis}` };
    }

    return {
      name: "api-readiness",
      status: "fail",
      detail: `status=${response.status}, api=${status ?? "unknown"}, db=${db}, redis=${redis}`,
    };
  } catch (error) {
    return {
      name: "api-readiness",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkFrontend(options: HealthcheckOptions): Promise<CheckResult> {
  if (!options.frontendUrl) {
    return {
      name: "frontend-static",
      status: "skip",
      detail: "set ROUND1_HEALTHCHECK_FRONTEND_URL or --frontend-url to enable",
    };
  }

  try {
    const response = await fetchWithTimeout(options.frontendUrl, options.timeoutMs);
    if (response.ok) {
      return { name: "frontend-static", status: "pass", detail: `status=${response.status}` };
    }

    return { name: "frontend-static", status: "fail", detail: `status=${response.status}` };
  } catch (error) {
    return {
      name: "frontend-static",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkMailConfig(options: HealthcheckOptions): CheckResult {
  if (!options.includeExternal) {
    return {
      name: "mail-config",
      status: "skip",
      detail: "use --include-external for mail provider smoke checks",
    };
  }

  const provider = process.env.MAIL_PROVIDER || "resend";
  const requiredByProvider: Record<string, string[]> = {
    resend: ["MAIL_FROM", "RESEND_API_KEY"],
    postmark: ["MAIL_FROM", "POSTMARK_SERVER_TOKEN"],
    "tencent-ses": ["MAIL_FROM", "TENCENT_SES_SECRET_ID", "TENCENT_SES_SECRET_KEY"],
  };
  const missing = (requiredByProvider[provider] ?? ["MAIL_FROM"]).filter(
    (key) => !process.env[key],
  );

  if (missing.length === 0) {
    return { name: "mail-config", status: "pass", detail: `provider=${provider}` };
  }

  return {
    name: "mail-config",
    status: "fail",
    detail: `provider=${provider}, missing=${missing.join(",")}`,
  };
}

function checkTurnstileConfig(options: HealthcheckOptions): CheckResult {
  if (!options.includeExternal) {
    return {
      name: "turnstile-config",
      status: "skip",
      detail: "use --include-external for Turnstile config checks",
    };
  }

  const hasSiteKey = Boolean(process.env.AUTH_TURNSTILE_SITE_KEY);
  const hasSecret = Boolean(process.env.AUTH_TURNSTILE_SECRET_KEY);
  if (hasSiteKey && hasSecret) {
    return { name: "turnstile-config", status: "pass", detail: "site key and secret configured" };
  }

  return {
    name: "turnstile-config",
    status: "fail",
    detail: `siteKey=${hasSiteKey ? "set" : "missing"}, secret=${hasSecret ? "set" : "missing"}`,
  };
}

async function checkOfflineRunner(options: HealthcheckOptions): Promise<CheckResult> {
  if (!options.includeOffline) {
    return {
      name: "offline-runner",
      status: "skip",
      detail: "use --include-offline for cpp-runner smoke checks",
    };
  }

  try {
    const response = await fetchWithTimeout(options.runnerUrl, options.timeoutMs);
    if (response.ok) {
      return { name: "offline-runner", status: "pass", detail: `status=${response.status}` };
    }

    return { name: "offline-runner", status: "fail", detail: `status=${response.status}` };
  } catch (error) {
    return {
      name: "offline-runner",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkPm2(options: HealthcheckOptions): Promise<CheckResult> {
  if (!options.checkPm2) {
    return { name: "pm2-processes", status: "skip", detail: "use --pm2 to check PM2 process status" };
  }

  const command = process.platform === "win32" ? "pm2.cmd" : "pm2";
  const requiredApps = ["round1-api"];
  if (options.expectRuntimeWorker) {
    requiredApps.push("round1-runtime-worker");
  }
  if (options.expectContentWorker) {
    requiredApps.push("round1-content-worker");
  }

  try {
    const { stdout } = await execFileAsync(command, ["jlist"], { timeout: options.timeoutMs });
    const output = typeof stdout === "string" ? stdout : stdout.toString("utf8");
    const apps = JSON.parse(output) as Array<{ name?: string; pm2_env?: { status?: string } }>;
    const missingOrDown = requiredApps.filter((name) => {
      const app = apps.find((item) => item.name === name);
      return app?.pm2_env?.status !== "online";
    });

    if (missingOrDown.length === 0) {
      return {
        name: "pm2-processes",
        status: "pass",
        detail: `online=${requiredApps.join(",")}`,
      };
    }

    return {
      name: "pm2-processes",
      status: "fail",
      detail: `missing-or-down=${missingOrDown.join(",")}`,
    };
  } catch (error) {
    return {
      name: "pm2-processes",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: CheckResult[]): void {
  for (const result of results) {
    const marker = result.status.toUpperCase().padEnd(4, " ");
    console.log(`[${marker}] ${result.name} - ${result.detail}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions();
  const results = [
    await checkApiHealth(options),
    await checkFrontend(options),
    checkMailConfig(options),
    checkTurnstileConfig(options),
    await checkOfflineRunner(options),
    await checkPm2(options),
  ];

  if (options.json) {
    console.log(JSON.stringify({ success: results.every((result) => result.status !== "fail"), results }, null, 2));
  } else {
    printResults(results);
  }

  if (results.some((result) => result.status === "fail")) {
    process.exitCode = 1;
  }
}

void main();
