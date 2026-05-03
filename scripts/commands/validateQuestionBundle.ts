import { writeFile } from "node:fs/promises";

import {
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
} from "../lib/bundleTypes.js";
import { loadQuestionBundle, validateQuestionBundle } from "../lib/questionBundleWorkflow.js";

function printHelp() {
  console.log(`Usage: tsx scripts/commands/validateQuestionBundle.ts <bundle-path> [options]

Validate a question bundle JSON file against the offline bundle contract.

Options:
  --run-sandbox      Compile/run code questions with cpp-runner
  --write           Persist successful sandbox verification as sandboxVerified=true
  --judge           Run LLM judge validation for each item
  --judge-timeout   Timeout for each judge call in ms (default: 90000)
  --judge-attempts  Attempts per item before failing (default: 1)
  --judge-items     Comma-separated zero-based item indexes to judge
  --skip-duplicate-checks
                    Skip DB duplicate checks; useful for post-import asset revalidation
  --require-duplicate-checks
                    Fail validation if DB duplicate checks cannot run
  --write-metadata  Persist validation metadata and item checksum manifest when validation passes
  --help            Show this help message
`);
}

async function main() {
  const [bundlePath, ...rest] = process.argv.slice(2);

  if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
    printHelp();
    return;
  }

  let runSandbox = false;
  let writeVerified = false;
  let runJudge = false;
  let judgeTimeoutMs = 90_000;
  let judgeAttempts = 1;
  let judgeItemIndexes: Set<number> | undefined;
  let skipDuplicateChecks = false;
  let requireDuplicateChecks = false;
  let writeMetadata = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--run-sandbox") {
      runSandbox = true;
      continue;
    }

    if (token === "--write") {
      writeVerified = true;
      runSandbox = true;
      continue;
    }

    if (token === "--judge") {
      runJudge = true;
      continue;
    }

    if (token === "--skip-duplicate-checks") {
      skipDuplicateChecks = true;
      continue;
    }

    if (token === "--require-duplicate-checks") {
      requireDuplicateChecks = true;
      continue;
    }

    if (token === "--write-metadata") {
      writeMetadata = true;
      continue;
    }

    if (token === "--judge-timeout") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --judge-timeout");
      }
      judgeTimeoutMs = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    if (token === "--judge-attempts") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --judge-attempts");
      }
      judgeAttempts = Number.parseInt(value, 10);
      if (!Number.isInteger(judgeAttempts) || judgeAttempts <= 0) {
        throw new Error("--judge-attempts must be a positive integer");
      }
      index += 1;
      continue;
    }

    if (token === "--judge-items") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --judge-items");
      }
      judgeItemIndexes = new Set(
        value.split(",").map((entry) => {
          const parsed = Number.parseInt(entry.trim(), 10);
          if (!Number.isInteger(parsed) || parsed < 0) {
            throw new Error(`Invalid --judge-items entry: ${entry}`);
          }
          return parsed;
        }),
      );
      index += 1;
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  if (judgeItemIndexes && !runJudge) {
    throw new Error("--judge-items requires --judge");
  }

  if (skipDuplicateChecks && requireDuplicateChecks) {
    throw new Error("--skip-duplicate-checks cannot be combined with --require-duplicate-checks");
  }

  const loaded = await loadQuestionBundle(bundlePath);
  const result = await validateQuestionBundle(loaded, {
    runSandbox,
    runJudge,
    judgeTimeoutMs,
    judgeAttempts,
    judgeItemIndexes,
    skipDuplicateChecks,
    requireDuplicateChecks,
  });

  let updatedChecksum: string | undefined;
  if (result.errors.length === 0 && (writeVerified || writeMetadata)) {
    for (const itemIndex of result.sandboxVerifiedItemIndexes) {
      const item = loaded.bundle.items[itemIndex];
      if (item && writeVerified) {
        item.sandboxVerified = true;
      }
    }

    loaded.bundle.meta.validation = buildValidationMetadata({
      duplicateChecksSkipped: result.duplicateChecksSkipped,
      judgeChecksSkipped: result.judgeChecksSkipped,
      sandboxVerifiedItemIndexes: result.sandboxVerifiedItemIndexes,
    });
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);

    const updatedRaw = `${JSON.stringify(loaded.bundle, null, 2)}\n`;
    await writeFile(loaded.sourcePath, updatedRaw, "utf8");
    updatedChecksum = computeChecksum(updatedRaw);
  }

  console.log(
    JSON.stringify(
      {
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        updatedChecksum,
        duplicateChecksSkipped: result.duplicateChecksSkipped,
        judgeChecksSkipped: result.judgeChecksSkipped,
        judgeItemIndexes: judgeItemIndexes
          ? [...judgeItemIndexes].sort((a, b) => a - b)
          : undefined,
        sandboxVerifiedItemIndexes: result.sandboxVerifiedItemIndexes,
        summary: result.summary,
      },
      null,
      2,
    ),
  );

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
