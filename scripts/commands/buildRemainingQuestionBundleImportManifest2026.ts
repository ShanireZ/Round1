import fs from "node:fs";
import path from "node:path";

import { pool } from "../../server/db.js";

const usage = `Usage: npx tsx scripts/buildRemainingQuestionBundleImportManifest2026.ts (--manifest <manifest.json> | --dir <question-bundle-dir>) [--out <remaining-manifest.json>]`;
const usage = `Usage: npx tsx scripts/commands/buildRemainingQuestionBundleImportManifest2026.ts (--manifest <manifest.json> | --dir <question-bundle-dir>) [--out <remaining-manifest.json>]`;

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function toRepoPath(filePath: string) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function listQuestionBundleFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listQuestionBundleFiles(entryPath));
    } else if (
      entry.isFile() &&
      entry.name.includes("__question-bundle__") &&
      entry.name.endsWith(".json")
    ) {
      files.push(toRepoPath(entryPath));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function fetchExistingContentHashes(contentHashes: string[]) {
  const existing = new Set<string>();
  const chunkSize = 1_000;

  for (let index = 0; index < contentHashes.length; index += chunkSize) {
    const chunk = contentHashes.slice(index, index + chunkSize);
    const result = await pool.query<{ content_hash: string }>(
      "select content_hash from questions where content_hash = any($1::varchar[])",
      [chunk],
    );
    for (const row of result.rows) {
      existing.add(row.content_hash);
    }
  }

  return existing;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const manifestArg = readArg(args, "--manifest");
  const dirArg = readArg(args, "--dir");
  if (!manifestArg && !dirArg) {
    throw new Error("--manifest or --dir is required");
  }
  if (manifestArg && dirArg) {
    throw new Error("--manifest and --dir are mutually exclusive");
  }

  const sourcePath = path.resolve(process.cwd(), manifestArg ?? dirArg!);
  const outPath = path.resolve(
    process.cwd(),
    readArg(args, "--out") ??
      path.join(
        manifestArg ? path.dirname(sourcePath) : process.cwd(),
        `${path.basename(sourcePath, ".json")}.remaining.json`,
      ),
  );

  const bundlePaths = manifestArg
    ? (() => {
        const parsed = readJson(sourcePath) as { bundlePaths?: unknown };
        if (!Array.isArray(parsed.bundlePaths)) {
          throw new Error(`Manifest must contain bundlePaths: ${manifestArg}`);
        }
        return parsed.bundlePaths;
      })()
    : listQuestionBundleFiles(sourcePath);

  const bundleRows = bundlePaths.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error("bundlePaths must contain only strings");
    }
    const bundle = readJson(path.resolve(process.cwd(), entry)) as {
      items?: Array<{ contentHash?: unknown }>;
    };
    if (!Array.isArray(bundle.items)) {
      throw new Error(`Bundle missing items: ${entry}`);
    }
    const contentHashes = bundle.items.map((item, itemIndex) => {
      if (typeof item.contentHash !== "string") {
        throw new Error(`Bundle item missing contentHash: ${entry}#${itemIndex}`);
      }
      return item.contentHash;
    });
    return { path: entry, contentHashes, itemCount: contentHashes.length };
  });

  const existing = await fetchExistingContentHashes([
    ...new Set(bundleRows.flatMap((row) => row.contentHashes)),
  ]);

  const importedBundlePaths: string[] = [];
  const remainingBundlePaths: string[] = [];
  const partialBundlePaths: Array<{ path: string; existingItems: number; itemCount: number }> = [];
  let importedItems = 0;
  let remainingItems = 0;

  for (const row of bundleRows) {
    const existingItems = row.contentHashes.filter((contentHash) =>
      existing.has(contentHash),
    ).length;
    if (existingItems === 0) {
      remainingBundlePaths.push(row.path);
      remainingItems += row.itemCount;
    } else if (existingItems === row.itemCount) {
      importedBundlePaths.push(row.path);
      importedItems += row.itemCount;
    } else {
      partialBundlePaths.push({ path: row.path, existingItems, itemCount: row.itemCount });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePath: toRepoPath(sourcePath),
    expectedBundles: remainingBundlePaths.length,
    expectedItems: remainingItems,
    importedBundles: importedBundlePaths.length,
    importedItems,
    partialBundles: partialBundlePaths,
    bundlePaths: remainingBundlePaths,
  };

  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outPath: toRepoPath(outPath),
        expectedBundles: report.expectedBundles,
        expectedItems: report.expectedItems,
        importedBundles: report.importedBundles,
        importedItems: report.importedItems,
        partialBundles: report.partialBundles.length,
      },
      null,
      2,
    ),
  );

  if (partialBundlePaths.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
