const fs = require("node:fs");
const path = require("node:path");

const reportDir = path.resolve(process.cwd(), "count/runs/2026-05-02T02-05-46-784Z");
const defaultRunInventoryPath = path.join(reportDir, "question-inventory.json");
const replacementInventoryPath = readArg("--replacement-inventory")
  ? path.resolve(process.cwd(), readArg("--replacement-inventory"))
  : path.join(reportDir, "target4-dedupe-replacement-inventory.json");
const currentInventoryPath = readArg("--question-inventory")
  ? path.resolve(process.cwd(), readArg("--question-inventory"))
  : fs.existsSync(defaultRunInventoryPath)
    ? defaultRunInventoryPath
    : path.resolve(process.cwd(), "count/state/question-inventory.json");
const outputPath = readArg("--output")
  ? path.resolve(process.cwd(), readArg("--output"))
  : path.join(reportDir, "target4-final-fill-inventory.json");
const refresh = process.argv.includes("--refresh");

const targetExamTypes = new Set(["GESP-1", "GESP-2", "CSP-J", "CSP-S"]);

function toRepoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (fs.existsSync(outputPath) && !refresh) {
  const existing = readJson(outputPath);
  console.log(
    JSON.stringify(
      {
        outputPath: toRepoPath(outputPath),
        reusedExisting: true,
        totalDeficit: existing.totalDeficit,
        replacementDeficit: existing.replacementDeficit,
        targetDeficit: existing.targetDeficit,
      },
      null,
      2,
    ),
  );
  process.exit(0);
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
