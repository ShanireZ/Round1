import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "../server/db.js";
import {
  importQuestionBundle,
  loadQuestionBundle,
  validateQuestionBundle,
} from "./lib/questionBundleWorkflow.js";

const usage = `Usage: npx tsx scripts/importQuestionBundles2026.ts [--dir papers/2026] [--apply] [--run-judge] [--judge-rounds 2] [--limit count]`;

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }

  const dir = readArg(args, "--dir") ?? "papers/2026";
  const apply = args.includes("--apply");
  const runJudge = args.includes("--run-judge");
  const judgeRoundsRaw = readArg(args, "--judge-rounds");
  const judgeRounds = judgeRoundsRaw ? Number.parseInt(judgeRoundsRaw, 10) : 2;
  const limitRaw = readArg(args, "--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  if (!Number.isInteger(judgeRounds) || judgeRounds <= 0) {
    throw new Error("--judge-rounds must be a positive integer");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  const files = listJsonFiles(path.resolve(dir)).slice(0, limit);
  const summary = {
    filesFound: files.length,
    validated: 0,
    imported: 0,
    dryRun: 0,
    failed: 0,
    judgeRoundsCompleted: 0,
  };

  for (const file of files) {
    const repoPath = path.relative(process.cwd(), file).replaceAll(path.sep, "/");
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
        importedBy: "scripts/importQuestionBundles2026.ts",
      });

      summary.validated += 1;
      if (apply && result.status === "applied") {
        summary.imported += loaded.bundle.items.length;
      } else {
        summary.dryRun += 1;
      }
      console.log(`OK ${repoPath}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`FAIL ${repoPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
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
