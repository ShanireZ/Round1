const fs = require("node:fs");
const path = require("node:path");

const reportDir = path.resolve(
  process.cwd(),
  "artifacts/reports/2026/runs/2026-05-02T02-05-46-784Z",
);
const manifestPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(reportDir, "target4-generated-question-bundles-manifest.json");

function toRepoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const manifest = readJson(manifestPath);
if (!Array.isArray(manifest.bundlePaths)) {
  throw new Error(`Manifest must contain bundlePaths: ${manifestPath}`);
}

const seen = new Map();
const duplicateErrors = [];
const excluded = new Set();
let itemCount = 0;

for (const repoPath of manifest.bundlePaths) {
  const filePath = path.resolve(process.cwd(), repoPath);
  const bundle = readJson(filePath);
  if (!bundle?.meta || !Array.isArray(bundle.items)) {
    throw new Error(`Not a question bundle: ${repoPath}`);
  }

  bundle.items.forEach((item, itemIndex) => {
    itemCount += 1;
    const contentHash = item?.contentHash;
    if (typeof contentHash !== "string" || contentHash.length === 0) {
      throw new Error(`Missing contentHash: ${repoPath}#${itemIndex}`);
    }

    const location = `${repoPath}#${itemIndex}`;
    const existing = seen.get(contentHash);
    if (existing) {
      duplicateErrors.push({
        contentHash,
        firstLocation: existing,
        duplicateLocation: location,
        excludedBundlePath: repoPath,
      });
      excluded.add(repoPath);
      return;
    }
    seen.set(contentHash, location);
  });
}

const excludedBundlePaths = [...excluded].sort((left, right) => left.localeCompare(right));
const excludedBundleRows = excludedBundlePaths.map((repoPath) => {
  const bundle = readJson(path.resolve(process.cwd(), repoPath));
  const count = bundle.items.length;
  return {
    examType: bundle.meta.examType,
    questionType: bundle.meta.questionType,
    difficulty: bundle.meta.difficulty,
    kpGroup: bundle.meta.primaryKpCode,
    required: count,
    available: 0,
    deficit: count,
    excludedBundlePath: repoPath,
  };
});

const cleanBundlePaths = manifest.bundlePaths.filter((repoPath) => !excluded.has(repoPath));
const excludedItemCount = excludedBundleRows.reduce((sum, row) => sum + row.deficit, 0);

fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "target4-duplicate-contenthash-report.json");
const baseManifestPath = path.join(reportDir, "target4-generated-question-bundles-manifest.dedupe-base.json");
const replacementInventoryPath = path.join(reportDir, "target4-dedupe-replacement-inventory.json");

fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceManifestPath: toRepoPath(manifestPath),
      duplicateContentHashes: duplicateErrors.length,
      filesFound: manifest.bundlePaths.length,
      itemCount,
      excludedBundles: excludedBundlePaths.length,
      excludedItemCount,
      cleanBundles: cleanBundlePaths.length,
      cleanItemCount: itemCount - excludedItemCount,
      duplicates: duplicateErrors,
      excludedBundleRows,
    },
    null,
    2,
  )}\n`,
);

fs.writeFileSync(
  baseManifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceManifestPath: toRepoPath(manifestPath),
      expectedBundles: cleanBundlePaths.length,
      expectedItems: itemCount - excludedItemCount,
      bundlePaths: cleanBundlePaths,
    },
    null,
    2,
  )}\n`,
);

fs.writeFileSync(
  replacementInventoryPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceManifestPath: toRepoPath(manifestPath),
      sourceDuplicateReportPath: toRepoPath(reportPath),
      deficits: excludedBundleRows.map(
        ({ examType, questionType, difficulty, kpGroup, required, available, deficit }) => ({
          examType,
          questionType,
          difficulty,
          kpGroup,
          required,
          available,
          deficit,
        }),
      ),
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      duplicateContentHashes: duplicateErrors.length,
      excludedBundles: excludedBundlePaths.length,
      excludedItemCount,
      cleanBundles: cleanBundlePaths.length,
      cleanItemCount: itemCount - excludedItemCount,
      reportPath: toRepoPath(reportPath),
      baseManifestPath: toRepoPath(baseManifestPath),
      replacementInventoryPath: toRepoPath(replacementInventoryPath),
    },
    null,
    2,
  ),
);
