import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "../server/db.js";
import {
  importQuestionBundle,
  loadQuestionBundle,
  validateQuestionBundle,
} from "./lib/questionBundleWorkflow.js";

const usage = `Usage: npx tsx scripts/importQuestionBundles2026.ts [--dir papers/2026] [--manifest report-or-manifest.json[,more.json]] [--apply] [--run-judge] [--judge-rounds 2] [--limit count] [--expected-items count] [--imported-by user-uuid]`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function readManifestPaths(manifestPath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    bundlePaths?: unknown;
    bundles?: unknown;
  };

  if (Array.isArray(parsed.bundlePaths)) {
    return parsed.bundlePaths.filter((entry): entry is string => typeof entry === "string");
  }

  if (Array.isArray(parsed.bundles)) {
    return parsed.bundles
      .filter((entry): entry is { path: string; finalVerdict?: string } => {
        if (typeof entry !== "object" || entry === null) {
          return false;
        }
        const maybeEntry = entry as { path?: unknown; finalVerdict?: unknown };
        return (
          typeof maybeEntry.path === "string" &&
          (maybeEntry.finalVerdict === undefined || maybeEntry.finalVerdict === "pass")
        );
      })
      .map((entry) => entry.path);
  }

  throw new Error(`Unsupported manifest shape: ${manifestPath}`);
}

function listManifestFiles(manifestArg: string): string[] {
  const files = manifestArg
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((manifestPath) => readManifestPaths(manifestPath))
    .map((entry) => path.resolve(entry));

  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function describeUnknown(value: unknown): string {
  if (value instanceof Error) {
    const maybeCause = (value as Error & { cause?: unknown }).cause;
    return maybeCause === undefined
      ? value.message
      : `${value.message}; cause: ${describeUnknown(maybeCause)}`;
  }

  if (typeof value === "object" && value !== null) {
    const details = value as Record<string, unknown>;
    const fields = ["message", "code", "detail", "hint", "constraint", "table", "column"]
      .map((key) => {
        const field = details[key];
        return field === undefined ? undefined : `${key}=${String(field)}`;
      })
      .filter((field): field is string => field !== undefined);

    if (fields.length > 0) {
      return fields.join(", ");
    }
  }

  return String(value);
}

async function preflightContentHashes(files: string[]) {
  const seen = new Map<string, string>();
  const duplicateErrors: string[] = [];
  let itemCount = 0;

  for (const file of files) {
    const loaded = await loadQuestionBundle(file);
    const repoPath = path.relative(process.cwd(), file).replaceAll(path.sep, "/");

    loaded.bundle.items.forEach((item, itemIndex) => {
      itemCount += 1;
      const location = `${repoPath}#${itemIndex}`;
      const existing = seen.get(item.contentHash);
      if (existing) {
        duplicateErrors.push(`duplicate contentHash ${item.contentHash}: ${existing} and ${location}`);
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

  const dir = readArg(args, "--dir") ?? "papers/2026";
  const apply = args.includes("--apply");
  const runJudge = args.includes("--run-judge");
  const judgeRoundsRaw = readArg(args, "--judge-rounds");
  const judgeRounds = judgeRoundsRaw ? Number.parseInt(judgeRoundsRaw, 10) : 2;
  const limitRaw = readArg(args, "--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const expectedItemsRaw = readArg(args, "--expected-items");
  const expectedItems = expectedItemsRaw ? Number.parseInt(expectedItemsRaw, 10) : undefined;
  const manifest = readArg(args, "--manifest");
  const importedBy = readArg(args, "--imported-by") ?? null;

  if (!Number.isInteger(judgeRounds) || judgeRounds <= 0) {
    throw new Error("--judge-rounds must be a positive integer");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }
  if (expectedItems !== undefined && (!Number.isInteger(expectedItems) || expectedItems <= 0)) {
    throw new Error("--expected-items must be a positive integer");
  }
  if (importedBy !== null && !UUID_PATTERN.test(importedBy)) {
    throw new Error("--imported-by must be a valid user UUID");
  }

  const files = (manifest ? listManifestFiles(manifest) : listJsonFiles(path.resolve(dir))).slice(
    0,
    limit,
  );
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
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

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
        importedBy,
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
      console.error(`FAIL ${repoPath}: ${describeUnknown(error)}`);
    }
  }

  if (expectedItems !== undefined && preflight.itemCount !== expectedItems) {
    summary.failed += 1;
    console.error(`FAIL expected ${expectedItems} items from manifest, found ${preflight.itemCount}`);
    process.exitCode = 1;
  }
  if (summary.failed > 0) {
    process.exitCode = 1;
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
