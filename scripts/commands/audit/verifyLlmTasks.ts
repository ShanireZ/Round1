import { and, desc, gte, inArray } from "drizzle-orm";

import { env } from "../../../config/env.js";
import { routeOverrideProviderNames } from "../../../config/llm.js";
import { db, pool } from "../../../server/db.js";
import { llmProviderLogs } from "../../../server/db/schema/llmProviderLogs.js";
import { callScriptLlmScene, resolveScriptProviderChain } from "../../lib/scriptLlmClient.js";

const allowedProviders = new Set<string>(routeOverrideProviderNames);
const tasks = ["generate", "judge"] as const;

interface Args {
  timeoutMs: number;
  skipFailure: boolean;
}

function parseArgs(argv: string[]): Args {
  let timeoutMs = 60_000;
  let skipFailure = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--timeout") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --timeout");
      }
      timeoutMs = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    if (token === "--skip-failure") {
      skipFailure = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      console.log(`Usage: tsx scripts/commands/audit/verifyLlmTasks.ts [options]

Options:
  --timeout <ms>       Timeout for each live LLM call (default: 60000)
  --skip-failure       Skip the controlled local failure-path check
  --help               Show this help message
`);
      process.exit(0);
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout must be a positive integer");
  }

  return { timeoutMs, skipFailure };
}

function assertAllowedChain(
  label: string,
  chain: ReturnType<typeof resolveScriptProviderChain>,
): void {
  const disallowed = chain
    .map((entry) => entry.providerName)
    .filter((providerName) => !allowedProviders.has(providerName));

  if (disallowed.length > 0) {
    throw new Error(
      `${label} contains unsupported provider(s): ${[...new Set(disallowed)].join(", ")}. ` +
        `Use only ${routeOverrideProviderNames.join(", ")} for LLM fallback/override verification.`,
    );
  }
}

function describeChain(chain: ReturnType<typeof resolveScriptProviderChain>): string {
  return chain.map((entry) => `${entry.lane}:${entry.providerName}:${entry.model}`).join(" -> ");
}

function assertTelemetry(
  label: string,
  log: typeof llmProviderLogs.$inferSelect | undefined,
  options: { requireTokens: boolean; requireError: boolean },
): void {
  if (!log) {
    throw new Error(`Missing llm_provider_logs row for ${label}`);
  }

  if (!allowedProviders.has(log.provider)) {
    throw new Error(`${label} logged unsupported provider: ${log.provider}`);
  }

  if (!Number.isFinite(log.latencyMs) || log.latencyMs < 0) {
    throw new Error(`${label} has invalid latency_ms: ${log.latencyMs}`);
  }

  if (
    log.costEstimate === null ||
    log.costEstimate === undefined ||
    !Number.isFinite(log.costEstimate) ||
    log.costEstimate < 0
  ) {
    throw new Error(`${label} has invalid cost_estimate: ${String(log.costEstimate)}`);
  }

  if (options.requireTokens && (log.tokensIn <= 0 || log.tokensOut <= 0)) {
    throw new Error(
      `${label} did not record positive token usage: in=${log.tokensIn}, out=${log.tokensOut}`,
    );
  }

  if (options.requireError && !log.errorMessage) {
    throw new Error(`${label} did not record error_message`);
  }

  if (!options.requireError && log.errorMessage) {
    throw new Error(`${label} unexpectedly recorded error_message: ${log.errorMessage}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date(Date.now() - 1_000);

  const configuredChain = resolveScriptProviderChain("generate", { runtimeEnv: env });
  assertAllowedChain("Configured LLM chain", configuredChain);
  console.log(`Configured chain: ${describeChain(configuredChain)}`);

  const generateResult = await callScriptLlmScene({
    scene: "generate",
    runtimeEnv: env,
    system:
      "You are a Round1 LLM smoke-test generator. Use only synthetic content. Return concise plain text.",
    prompt:
      "Create a tiny synthetic multiple-choice question about adding two integers. Include an answer and one-sentence explanation.",
    maxTokens: 256,
    timeoutMs: args.timeoutMs,
  });
  console.log(
    `generate ok: ${generateResult.providerName}:${generateResult.model} ` +
      `tokens=${generateResult.inputTokens}/${generateResult.outputTokens}`,
  );

  const judgeResult = await callScriptLlmScene({
    scene: "judge",
    runtimeEnv: env,
    system:
      "You are a Round1 LLM smoke-test judge. Use only the synthetic item in the prompt. Return concise plain text.",
    prompt:
      "Judge this synthetic item: What is 2 + 3? Options: A.4 B.5 C.6 D.7. Answer: B. Explanation: 2 + 3 = 5. Reply ACCEPT or REJECT with one reason.",
    maxTokens: 128,
    timeoutMs: args.timeoutMs,
  });
  console.log(
    `judge ok: ${judgeResult.providerName}:${judgeResult.model} ` +
      `tokens=${judgeResult.inputTokens}/${judgeResult.outputTokens}`,
  );

  let expectedFailureMessage: string | undefined;
  if (!args.skipFailure) {
    const failureRuntimeEnv = {
      ...env,
      LLM_PROVIDER_DEFAULT: "deepseek",
      LLM_PROVIDER_BACKUP: "",
      DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY || "round1-verify-invalid-key",
      DEEPSEEK_BASE_URL: "http://127.0.0.1:9/v1",
      DEEPSEEK_MODEL: env.DEEPSEEK_MODEL || "deepseek-chat",
    };
    const failureChain = resolveScriptProviderChain("judge", {
      runtimeEnv: failureRuntimeEnv,
      allowBackupFallback: false,
    });
    assertAllowedChain("Controlled failure chain", failureChain);

    try {
      await callScriptLlmScene({
        scene: "judge",
        runtimeEnv: failureRuntimeEnv,
        system: "Synthetic failure-path smoke test.",
        prompt: "This prompt is intentionally routed to localhost to verify error logging.",
        maxTokens: 32,
        timeoutMs: Math.min(args.timeoutMs, 3_000),
        allowBackupFallback: false,
      });
      throw new Error("Controlled failure call unexpectedly succeeded");
    } catch (error) {
      expectedFailureMessage = error instanceof Error ? error.message : String(error);
      console.log(`controlled failure ok: ${expectedFailureMessage}`);
    }
  }

  const logs = await db
    .select()
    .from(llmProviderLogs)
    .where(and(gte(llmProviderLogs.createdAt, startedAt), inArray(llmProviderLogs.task, tasks)))
    .orderBy(desc(llmProviderLogs.createdAt));

  const generateLog = logs.find(
    (log) =>
      log.task === "generate" &&
      !log.errorMessage &&
      log.provider === generateResult.providerName &&
      log.tokensIn === generateResult.inputTokens &&
      log.tokensOut === generateResult.outputTokens,
  );
  const judgeLog = logs.find(
    (log) =>
      log.task === "judge" &&
      !log.errorMessage &&
      log.provider === judgeResult.providerName &&
      log.tokensIn === judgeResult.inputTokens &&
      log.tokensOut === judgeResult.outputTokens,
  );
  const failureLog = logs.find(
    (log) =>
      log.task === "judge" &&
      Boolean(log.errorMessage) &&
      log.provider === "deepseek" &&
      (!expectedFailureMessage || expectedFailureMessage.includes(log.provider)),
  );

  assertTelemetry("generate success", generateLog, {
    requireTokens: true,
    requireError: false,
  });
  assertTelemetry("judge success", judgeLog, {
    requireTokens: true,
    requireError: false,
  });

  if (!args.skipFailure) {
    assertTelemetry("judge controlled failure", failureLog, {
      requireTokens: false,
      requireError: true,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedSince: startedAt.toISOString(),
        generate: {
          provider: generateLog!.provider,
          model: generateLog!.responseModel ?? generateLog!.model,
          tokensIn: generateLog!.tokensIn,
          tokensOut: generateLog!.tokensOut,
          costEstimate: generateLog!.costEstimate,
          latencyMs: generateLog!.latencyMs,
        },
        judge: {
          provider: judgeLog!.provider,
          model: judgeLog!.responseModel ?? judgeLog!.model,
          tokensIn: judgeLog!.tokensIn,
          tokensOut: judgeLog!.tokensOut,
          costEstimate: judgeLog!.costEstimate,
          latencyMs: judgeLog!.latencyMs,
        },
        failure: failureLog
          ? {
              provider: failureLog.provider,
              model: failureLog.model,
              latencyMs: failureLog.latencyMs,
              errorMessage: failureLog.errorMessage,
            }
          : undefined,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
