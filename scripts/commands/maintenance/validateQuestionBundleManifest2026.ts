import { writeFile } from "node:fs/promises";

import {
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
} from "../../lib/bundleTypes.js";
import { listManifestBundleFiles } from "../../lib/batchWorkflow.js";
import {
  formatJsonOutput,
  parsePositiveInteger,
  readNamedArg,
  toDisplayRepoPath,
} from "../../lib/scriptCli.js";
import { loadQuestionBundle, validateQuestionBundle } from "../../lib/questionBundleWorkflow.js";

const usage = `Usage: npx tsx scripts/commands/maintenance/validateQuestionBundleManifest2026.ts --manifest <manifest.json> [--out <report.json>] [--run-sandbox] [--write] [--write-metadata] [--skip-duplicate-checks] [--concurrency n]`;

type ValidationRow = {
  path: string;
  itemCount: number;
  status: "passed" | "failed";
  errors: unknown[];
  sandboxVerifiedItemIndexes: number[];
  duplicateChecksSkipped: boolean;
  judgeChecksSkipped: boolean;
  updatedChecksum?: string;
};

async function runPool<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()),
  );
  return results;
}

async function validateOne(
  bundlePath: string,
  options: {
    runSandbox: boolean;
    writeVerified: boolean;
    writeMetadata: boolean;
    skipDuplicateChecks: boolean;
  },
): Promise<ValidationRow> {
  const loaded = await loadQuestionBundle(bundlePath);
  const result = await validateQuestionBundle(loaded, {
    runSandbox: options.runSandbox,
    skipDuplicateChecks: options.skipDuplicateChecks,
  });

  let updatedChecksum: string | undefined;
  if (result.errors.length === 0 && (options.writeVerified || options.writeMetadata)) {
    for (const itemIndex of result.sandboxVerifiedItemIndexes) {
      const item = loaded.bundle.items[itemIndex];
      if (item && options.writeVerified) {
        item.sandboxVerified = true;
      }
    }

    loaded.bundle.meta.validation = buildValidationMetadata({
      duplicateChecksSkipped: result.duplicateChecksSkipped,
      judgeChecksSkipped: result.judgeChecksSkipped,
      sandboxVerifiedItemIndexes: result.sandboxVerifiedItemIndexes,
    });
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);

    await writeFile(loaded.sourcePath, formatJsonOutput(loaded.bundle), "utf8");
    updatedChecksum = computeChecksum(formatJsonOutput(loaded.bundle));
  }

  return {
    path: toDisplayRepoPath(loaded.sourcePath),
    itemCount: loaded.bundle.items.length,
    status: result.errors.length === 0 ? "passed" : "failed",
    errors: result.errors,
    sandboxVerifiedItemIndexes: result.sandboxVerifiedItemIndexes,
    duplicateChecksSkipped: result.duplicateChecksSkipped,
    judgeChecksSkipped: result.judgeChecksSkipped,
    updatedChecksum,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const manifest = readNamedArg(args, "--manifest");
  if (!manifest) {
    throw new Error("--manifest is required");
  }

  const out = readNamedArg(args, "--out");
  const concurrency = parsePositiveInteger(readNamedArg(args, "--concurrency"), 4, "concurrency");
  const runSandbox = args.includes("--run-sandbox") || args.includes("--write");
  const writeVerified = args.includes("--write");
  const writeMetadata = args.includes("--write-metadata");
  const skipDuplicateChecks = args.includes("--skip-duplicate-checks");
  const files = listManifestBundleFiles(manifest);

  const startedAt = new Date().toISOString();
  const rows = await runPool(files, concurrency, (file) =>
    validateOne(file, {
      runSandbox,
      writeVerified,
      writeMetadata,
      skipDuplicateChecks,
    }),
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    startedAt,
    manifest,
    options: {
      runSandbox,
      writeVerified,
      writeMetadata,
      skipDuplicateChecks,
      concurrency,
    },
    summary: {
      files: rows.length,
      items: rows.reduce((sum, row) => sum + row.itemCount, 0),
      passed: rows.filter((row) => row.status === "passed").length,
      failed: rows.filter((row) => row.status === "failed").length,
      sandboxVerifiedItems: rows.reduce(
        (sum, row) => sum + row.sandboxVerifiedItemIndexes.length,
        0,
      ),
    },
    failed: rows.filter((row) => row.status === "failed"),
    rows,
  };

  if (out) {
    await writeFile(out, formatJsonOutput(payload), "utf8");
  }
  console.log(JSON.stringify(payload.summary, null, 2));

  if (payload.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
