import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "../../server/db.js";
import {
  describeUnknownError,
  listJsonFilesRecursively,
  listManifestBundleFiles,
} from "../lib/batchWorkflow.js";
import {
  importQuestionBundle,
  loadQuestionBundle,
  validateQuestionBundle,
} from "../lib/questionBundleWorkflow.js";
import {
  formatDiversityIssue,
  validateQuestionBundleFilesDiversity,
} from "../lib/questionDiversity.js";
import {
  parsePositiveInteger,
  printJsonOutput,
  readNamedArg,
  toDisplayRepoPath,
} from "../lib/scriptCli.js";

const usage = `Usage: npx tsx scripts/commands/importQuestionBundlesBatch.ts [--dir papers/2026] [--manifest report-or-manifest.json[,more.json]] [--apply] [--run-judge] [--judge-rounds 2] [--limit count] [--expected-items count] [--imported-by user-uuid] [--skip-duplicate-checks]`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function preflightContentHashes(files: string[]) {
  const seen = new Map<string, string>();
  const duplicateErrors: string[] = [];
  let itemCount = 0;

  for (const file of files) {
    const loaded = await loadQuestionBundle(file);
    const repoPath = toDisplayRepoPath(file);

    loaded.bundle.items.forEach((item, itemIndex) => {
      itemCount += 1;
      const location = `${repoPath}#${itemIndex}`;
      const existing = seen.get(item.contentHash);
      if (existing) {
        duplicateErrors.push(
          `duplicate contentHash ${item.contentHash}: ${existing} and ${location}`,
        );
        return;
      }
      seen.set(item.contentHash, location);
    });
  }

  return { itemCount, duplicateErrors };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }

  const dir = readNamedArg(args, "--dir") ?? "papers/2026";
  const apply = args.includes("--apply");
  const runJudge = args.includes("--run-judge");
  const skipDuplicateChecks = args.includes("--skip-duplicate-checks");
  const judgeRounds = parsePositiveInteger(readNamedArg(args, "--judge-rounds"), 2, "judge-rounds");
  const limitRaw = readNamedArg(args, "--limit");
  const limit = limitRaw === undefined ? undefined : parsePositiveInteger(limitRaw, 1, "limit");
  const expectedItemsRaw = readNamedArg(args, "--expected-items");
  const expectedItems =
    expectedItemsRaw === undefined
      ? undefined
      : parsePositiveInteger(expectedItemsRaw, 1, "expected-items");
  const manifest = readNamedArg(args, "--manifest");
  const importedBy = readNamedArg(args, "--imported-by") ?? null;

  if (importedBy !== null && !UUID_PATTERN.test(importedBy)) {
    throw new Error("--imported-by must be a valid user UUID");
  }

  const files = (
    manifest ? listManifestBundleFiles(manifest) : listJsonFilesRecursively(path.resolve(dir))
  ).slice(0, limit);
  const summary = {
    filesFound: files.length,
    validated: 0,
    imported: 0,
    dryRun: 0,
    failed: 0,
    judgeRoundsCompleted: 0,
    duplicateContentHashes: 0,
  };

  const preflight = await preflightContentHashes(files);
  summary.duplicateContentHashes = preflight.duplicateErrors.length;
  if (preflight.duplicateErrors.length > 0) {
    summary.failed += preflight.duplicateErrors.length;
    for (const error of preflight.duplicateErrors) {
      console.error(`FAIL ${error}`);
    }
    printJsonOutput(summary);
    process.exitCode = 1;
    return;
  }

  const diversity = validateQuestionBundleFilesDiversity(files);
  if (diversity.enforced && diversity.errors.length > 0) {
    summary.failed += diversity.errors.length;
    for (const issue of diversity.errors) {
      console.error(`FAIL ${formatDiversityIssue(issue)}`);
    }
    printJsonOutput(summary);
    process.exitCode = 1;
    return;
  }

  for (const file of files) {
    const repoPath = toDisplayRepoPath(file);
    try {
      const loaded = await loadQuestionBundle(file);

      if (runJudge) {
        for (let round = 1; round <= judgeRounds; round += 1) {
          const validation = await validateQuestionBundle(loaded, {
            runJudge: true,
            judgeAttempts: 1,
            judgeTimeoutMs: 90_000,
          });
          summary.judgeRoundsCompleted += 1;
          if (validation.errors.length > 0) {
            throw new Error(
              `judge round ${round} failed: ${validation.errors
                .map((error) => `${error.itemIndex ?? "bundle"}:${error.code}`)
                .join(", ")}`,
            );
          }
        }
      }

      const result = await importQuestionBundle(loaded, {
        apply,
        persistDryRun: !apply,
        importedBy,
        skipDuplicateChecks,
      });
      if (result.status === "failed") {
        throw new Error("question bundle import returned failed status");
      }

      summary.validated += 1;
      if (apply && result.status === "applied") {
        summary.imported += loaded.bundle.items.length;
      } else {
        summary.dryRun += 1;
      }
      console.log(`OK ${repoPath}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`FAIL ${repoPath}: ${describeUnknownError(error)}`);
    }
  }

  if (expectedItems !== undefined && preflight.itemCount !== expectedItems) {
    summary.failed += 1;
    console.error(
      `FAIL expected ${expectedItems} items from manifest, found ${preflight.itemCount}`,
    );
    process.exitCode = 1;
  }
  if (summary.failed > 0) {
    process.exitCode = 1;
  }

  printJsonOutput(summary);
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
