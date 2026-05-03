const fs = require("node:fs");
const path = require("node:path");

const reportRoot = path.resolve(process.cwd(), "artifacts/reports/2026");
const reportDir = path.join(reportRoot, "runs/2026-05-02T02-05-46-784Z");
const replacementInventoryPath = path.join(reportDir, "target4-dedupe-replacement-inventory.json");
const currentInventoryPath = path.join(reportRoot, "state/question-inventory.json");
const outputPath = path.join(reportDir, "target4-final-fill-inventory.json");

const targetExamTypes = new Set(["GESP-1", "GESP-2", "CSP-J", "CSP-S"]);

function toRepoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const replacementInventory = readJson(replacementInventoryPath);
const currentInventory = readJson(currentInventoryPath);

if (!Array.isArray(replacementInventory.deficits)) {
  throw new Error(`Missing deficits: ${replacementInventoryPath}`);
}
if (!Array.isArray(currentInventory.deficits)) {
  throw new Error(`Missing deficits: ${currentInventoryPath}`);
}

const targetDeficits = currentInventory.deficits
  .filter((row) => targetExamTypes.has(row.examType) && row.deficit > 0)
  .map((row) => ({
    examType: row.examType,
    questionType: row.questionType,
    difficulty: row.difficulty,
    kpGroup: row.kpGroup,
    required: row.deficit,
    available: 0,
    deficit: row.deficit,
  }));

const deficits = [
  ...replacementInventory.deficits.map((row) => ({
    examType: row.examType,
    questionType: row.questionType,
    difficulty: row.difficulty,
    kpGroup: row.kpGroup,
    required: row.deficit,
    available: 0,
    deficit: row.deficit,
  })),
  ...targetDeficits,
];

const totalDeficit = deficits.reduce((sum, row) => sum + row.deficit, 0);
if (totalDeficit === 0 || totalDeficit % 5 !== 0) {
  throw new Error(`Final fill deficit must be positive and divisible by 5, got ${totalDeficit}`);
}

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceReplacementInventoryPath: toRepoPath(replacementInventoryPath),
      sourceQuestionInventoryPath: toRepoPath(currentInventoryPath),
      totalDeficit,
      replacementDeficit: replacementInventory.deficits.reduce((sum, row) => sum + row.deficit, 0),
      targetDeficit: targetDeficits.reduce((sum, row) => sum + row.deficit, 0),
      deficits,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      outputPath: toRepoPath(outputPath),
      totalDeficit,
      rows: deficits.length,
      replacementRows: replacementInventory.deficits.length,
      targetRows: targetDeficits.length,
    },
    null,
    2,
  ),
);
