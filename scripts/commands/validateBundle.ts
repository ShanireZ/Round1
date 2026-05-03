import {
  dispatchByBundleType,
  parsePositiveInteger,
  printJsonOutput,
  readNamedArg,
  renderCliHelp,
  writeJsonOutput,
} from "../lib/scriptCli.js";
import {
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
} from "../lib/bundleTypes.js";
import {
  loadPrebuiltPaperBundle,
  validatePrebuiltPaperBundle,
} from "../lib/prebuiltPaperBundleWorkflow.js";
import { loadQuestionBundle, validateQuestionBundle } from "../lib/questionBundleWorkflow.js";

function printHelp() {
  console.log(
    renderCliHelp({
      usage: "tsx scripts/commands/validateBundle.ts <bundle-path> [options]",
      summary:
        "Validate a question bundle or prebuilt paper bundle. The command dispatches by meta.bundleType.",
      options: [
        {
          flag: "--write-metadata",
          description:
            "Persist validation metadata and item checksum manifest when validation passes",
        },
        {
          flag: "--run-sandbox",
          description: "Question bundle only: compile/run code questions with cpp-runner",
        },
        {
          flag: "--write",
          description:
            "Question bundle only: persist sandboxVerified=true after successful sandbox validation",
        },
        {
          flag: "--judge",
          description: "Question bundle only: run LLM judge validation for each item",
        },
        {
          flag: "--judge-timeout <ms>",
          description: "Question bundle only: timeout per judge call in ms (default: 90000)",
        },
        {
          flag: "--judge-attempts <n>",
          description: "Question bundle only: judge attempts per item (default: 1)",
        },
        {
          flag: "--judge-items <list>",
          description: "Question bundle only: comma-separated zero-based item indexes",
        },
        {
          flag: "--skip-duplicate-checks",
          description: "Question bundle only: skip DB duplicate checks",
        },
        {
          flag: "--require-duplicate-checks",
          description: "Question bundle only: fail if DB duplicate checks cannot run",
        },
        {
          flag: "--help",
          description: "Show this help message",
        },
      ],
    }),
  );
}

function parseJudgeItemIndexes(raw: string | undefined) {
  if (raw === undefined) {
    return undefined;
  }

  return new Set(
    raw.split(",").map((entry) => {
      const parsed = Number.parseInt(entry.trim(), 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid --judge-items entry: ${entry}`);
      }
      return parsed;
    }),
  );
}

function parseQuestionValidateArgs(rest: readonly string[]) {
  const allowedFlags = new Set([
    "--run-sandbox",
    "--write",
    "--judge",
    "--judge-timeout",
    "--judge-attempts",
    "--judge-items",
    "--skip-duplicate-checks",
    "--require-duplicate-checks",
    "--write-metadata",
  ]);

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) {
      continue;
    }

    if (!allowedFlags.has(token)) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    if (token === "--judge-timeout" || token === "--judge-attempts" || token === "--judge-items") {
      const next = rest[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${token}`);
      }
      index += 1;
    }
  }

  const runSandbox = rest.includes("--run-sandbox") || rest.includes("--write");
  const writeVerified = rest.includes("--write");
  const runJudge = rest.includes("--judge");
  const skipDuplicateChecks = rest.includes("--skip-duplicate-checks");
  const requireDuplicateChecks = rest.includes("--require-duplicate-checks");
  const writeMetadata = rest.includes("--write-metadata");
  const judgeTimeoutMs = parsePositiveInteger(
    readNamedArg(rest, "--judge-timeout"),
    90_000,
    "judge-timeout",
  );
  const judgeAttempts = parsePositiveInteger(
    readNamedArg(rest, "--judge-attempts"),
    1,
    "judge-attempts",
  );
  const judgeItemIndexes = parseJudgeItemIndexes(readNamedArg(rest, "--judge-items"));

  if (judgeItemIndexes && !runJudge) {
    throw new Error("--judge-items requires --judge");
  }

  if (skipDuplicateChecks && requireDuplicateChecks) {
    throw new Error("--skip-duplicate-checks cannot be combined with --require-duplicate-checks");
  }

  return {
    runSandbox,
    writeVerified,
    runJudge,
    judgeTimeoutMs,
    judgeAttempts,
    judgeItemIndexes,
    skipDuplicateChecks,
    requireDuplicateChecks,
    writeMetadata,
  };
}

function parsePrebuiltValidateArgs(rest: readonly string[]) {
  for (const token of rest) {
    if (token !== "--write-metadata") {
      throw new Error(`Unexpected argument for prebuilt paper bundle validation: ${token}`);
    }
  }

  return {
    writeMetadata: rest.includes("--write-metadata"),
  };
}

async function validateQuestionBundleCommand(bundlePath: string, rest: readonly string[]) {
  const args = parseQuestionValidateArgs(rest);
  const loaded = await loadQuestionBundle(bundlePath);
  const result = await validateQuestionBundle(loaded, {
    runSandbox: args.runSandbox,
    runJudge: args.runJudge,
    judgeTimeoutMs: args.judgeTimeoutMs,
    judgeAttempts: args.judgeAttempts,
    judgeItemIndexes: args.judgeItemIndexes,
    skipDuplicateChecks: args.skipDuplicateChecks,
    requireDuplicateChecks: args.requireDuplicateChecks,
  });

  let updatedChecksum: string | undefined;
  if (result.errors.length === 0 && (args.writeVerified || args.writeMetadata)) {
    for (const itemIndex of result.sandboxVerifiedItemIndexes) {
      const item = loaded.bundle.items[itemIndex];
      if (item && args.writeVerified) {
        item.sandboxVerified = true;
      }
    }

    loaded.bundle.meta.validation = buildValidationMetadata({
      duplicateChecksSkipped: result.duplicateChecksSkipped,
      judgeChecksSkipped: result.judgeChecksSkipped,
      sandboxVerifiedItemIndexes: result.sandboxVerifiedItemIndexes,
    });
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);

    await writeJsonOutput(loaded.sourcePath, loaded.bundle);
    updatedChecksum = computeChecksum(JSON.stringify(loaded.bundle, null, 2) + "\n");
  }

  printJsonOutput({
    sourceFilename: loaded.sourceFilename,
    checksum: loaded.checksum,
    updatedChecksum,
    duplicateChecksSkipped: result.duplicateChecksSkipped,
    judgeChecksSkipped: result.judgeChecksSkipped,
    judgeItemIndexes: args.judgeItemIndexes
      ? [...args.judgeItemIndexes].sort((left, right) => left - right)
      : undefined,
    sandboxVerifiedItemIndexes: result.sandboxVerifiedItemIndexes,
    summary: result.summary,
  });

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

async function validatePrebuiltPaperBundleCommand(bundlePath: string, rest: readonly string[]) {
  const args = parsePrebuiltValidateArgs(rest);
  const loaded = await loadPrebuiltPaperBundle(bundlePath);
  const result = await validatePrebuiltPaperBundle(loaded);

  let updatedChecksum: string | undefined;
  if (args.writeMetadata && result.errors.length === 0) {
    loaded.bundle.meta.validation = buildValidationMetadata({
      dbChecksSkipped: result.dbChecksSkipped,
    });
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);

    await writeJsonOutput(loaded.sourcePath, loaded.bundle);
    updatedChecksum = computeChecksum(JSON.stringify(loaded.bundle, null, 2) + "\n");
  }

  printJsonOutput({
    sourceFilename: loaded.sourceFilename,
    checksum: loaded.checksum,
    updatedChecksum,
    dbChecksSkipped: result.dbChecksSkipped,
    summary: result.summary,
  });

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const [bundlePath, ...rest] = process.argv.slice(2);

  if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
    printHelp();
    return;
  }

  await dispatchByBundleType({
    bundlePath,
    handlers: {
      question_bundle: async () => validateQuestionBundleCommand(bundlePath, rest),
      prebuilt_paper_bundle: async () => validatePrebuiltPaperBundleCommand(bundlePath, rest),
    },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
