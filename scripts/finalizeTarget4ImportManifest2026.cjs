const fs = require("node:fs");
const path = require("node:path");

const reportDir = path.resolve(
  process.cwd(),
  "artifacts/reports/2026/2026-05-02T02-05-46-784Z",
);
const papers2026Dir = path.resolve(process.cwd(), "papers/2026");
const baseManifestPath = path.join(reportDir, "target4-generated-question-bundles-manifest.dedupe-base.json");
const duplicateReportPath = path.join(reportDir, "target4-duplicate-contenthash-report.json");
const finalManifestPath = path.join(reportDir, "target4-generated-question-bundles-manifest.final-import.json");
const deletionReportPath = path.join(reportDir, "target4-deleted-duplicate-bundles.json");
const replacementPrefix = process.argv.find((arg) => arg.startsWith("--replacement-prefix="))?.split("=")[1] ?? "2026-05-02-bulk9040";
const deleteExcluded = process.argv.includes("--delete-excluded");

function toRepoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function assertInside(child, parent) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside ${toRepoPath(parent)}: ${child}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listJsonFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

function itemCountFor(repoPath) {
  const bundle = readJson(path.resolve(process.cwd(), repoPath));
  if (!Array.isArray(bundle.items)) {
    throw new Error(`Missing items: ${repoPath}`);
  }
  return bundle.items.length;
}

function collectContentHashes(bundlePaths) {
  const seen = new Map();
  const duplicates = [];
  let itemCount = 0;

  for (const repoPath of bundlePaths) {
    const bundle = readJson(path.resolve(process.cwd(), repoPath));
    if (!Array.isArray(bundle.items)) {
      throw new Error(`Missing items: ${repoPath}`);
    }
    bundle.items.forEach((item, itemIndex) => {
      itemCount += 1;
      const location = `${repoPath}#${itemIndex}`;
      const existing = seen.get(item.contentHash);
      if (existing) {
        duplicates.push({ contentHash: item.contentHash, firstLocation: existing, duplicateLocation: location });
      } else {
        seen.set(item.contentHash, location);
      }
    });
  }

  return { itemCount, duplicates };
}

const baseManifest = readJson(baseManifestPath);
if (!Array.isArray(baseManifest.bundlePaths)) {
  throw new Error(`Missing bundlePaths: ${baseManifestPath}`);
}

const replacementBundlePaths = listJsonFiles(papers2026Dir)
  .map((filePath) => toRepoPath(filePath))
  .filter((repoPath) => repoPath.includes(`/${replacementPrefix}-`) && repoPath.includes("__question-bundle__"))
  .sort((left, right) => left.localeCompare(right));
const replacementItemCount = replacementBundlePaths.reduce((sum, repoPath) => sum + itemCountFor(repoPath), 0);
if (replacementBundlePaths.length !== 6 || replacementItemCount !== 30) {
  throw new Error(
    `Expected 6 replacement bundles / 30 items for ${replacementPrefix}, got ${replacementBundlePaths.length} / ${replacementItemCount}`,
  );
}

const finalBundlePaths = [...baseManifest.bundlePaths, ...replacementBundlePaths].sort((left, right) =>
  left.localeCompare(right),
);
const contentHashCheck = collectContentHashes(finalBundlePaths);
if (contentHashCheck.duplicates.length > 0) {
  throw new Error(`Final manifest still has duplicate contentHash: ${JSON.stringify(contentHashCheck.duplicates, null, 2)}`);
}
if (contentHashCheck.itemCount !== 5385) {
  throw new Error(`Expected final import manifest to contain 5385 items, got ${contentHashCheck.itemCount}`);
}

fs.writeFileSync(
  finalManifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceBaseManifestPath: toRepoPath(baseManifestPath),
      replacementPrefix,
      replacementBundles: replacementBundlePaths.length,
      replacementItems: replacementItemCount,
      expectedBundles: finalBundlePaths.length,
      expectedItems: contentHashCheck.itemCount,
      bundlePaths: finalBundlePaths,
    },
    null,
    2,
  )}\n`,
);

const deletion = {
  generatedAt: new Date().toISOString(),
  sourceDuplicateReportPath: toRepoPath(duplicateReportPath),
  deleteExcluded,
  deletedBundleFiles: [],
  prunedDirectories: [],
};

if (deleteExcluded) {
  const duplicateReport = readJson(duplicateReportPath);
  const excludedPaths = [
    ...new Set(
      (duplicateReport.excludedBundleRows ?? [])
        .map((row) => row.excludedBundlePath)
        .filter((entry) => typeof entry === "string"),
    ),
  ];

  for (const repoPath of excludedPaths) {
    const filePath = path.resolve(process.cwd(), repoPath);
    assertInside(filePath, papers2026Dir);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
      deletion.deletedBundleFiles.push(repoPath);
    }

    for (const dir of [path.dirname(filePath), path.dirname(path.dirname(filePath))]) {
      assertInside(dir, papers2026Dir);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        deletion.prunedDirectories.push(toRepoPath(dir));
      }
    }
  }
}

fs.writeFileSync(deletionReportPath, `${JSON.stringify(deletion, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      finalManifestPath: toRepoPath(finalManifestPath),
      expectedBundles: finalBundlePaths.length,
      expectedItems: contentHashCheck.itemCount,
      replacementBundles: replacementBundlePaths.length,
      replacementItems: replacementItemCount,
      deletedBundleFiles: deletion.deletedBundleFiles.length,
      prunedDirectories: deletion.prunedDirectories.length,
    },
    null,
    2,
  ),
);
