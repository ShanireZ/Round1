/**
 * 手动出题导入 CLI
 *
 * 用法：npx tsx scripts/importManualQuestions.ts <filePath> --question-type <type> --exam-type <examType> --primary-kp-id <id> [--imported-by <userId>]
 *
 * filePath 指向一个 JSON 文件，包含 ManualQuestion[] 数组
 */
import fs from "node:fs";
import path from "node:path";

import { pool } from "../server/db.js";
import { computeChecksum } from "./lib/bundleTypes.js";
import { importManualQuestions } from "./lib/manualQuestionImport.js";

interface CliArgs {
  filePath: string;
  questionType: string;
  examType: string;
  primaryKpId: number;
  importedBy?: string;
}

function requireCliArg(value: string | undefined, name: string): string {
  if (!value) {
    console.error(
      `Usage: npx tsx scripts/importManualQuestions.ts <filePath> --question-type <type> --exam-type <examType> --primary-kp-id <id> [--imported-by <userId>] (missing ${name})`,
    );
    process.exit(1);
  }

  return value;
}

function parseArgs(argv: string[]): CliArgs {
  const [filePath, ...rest] = argv;
  const options = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || !value) {
      console.error(
        "Usage: npx tsx scripts/importManualQuestions.ts <filePath> --question-type <type> --exam-type <examType> --primary-kp-id <id> [--imported-by <userId>]",
      );
      process.exit(1);
    }

    options.set(key, value);
  }

  const primaryKpId = Number.parseInt(
    requireCliArg(options.get("--primary-kp-id"), "--primary-kp-id"),
    10,
  );

  if (!Number.isInteger(primaryKpId) || primaryKpId <= 0) {
    console.error("❌ --primary-kp-id must be a positive integer");
    process.exit(1);
  }

  return {
    filePath: requireCliArg(filePath, "filePath"),
    questionType: requireCliArg(options.get("--question-type"), "--question-type"),
    examType: requireCliArg(options.get("--exam-type"), "--exam-type"),
    primaryKpId,
    importedBy: options.get("--imported-by"),
  };
}

const cliArgs = parseArgs(process.argv.slice(2));

async function main() {
  const resolvedFilePath = requireCliArg(cliArgs.filePath, "filePath");

  // 读取 JSON 文件
  const rawData = fs.readFileSync(resolvedFilePath, "utf-8");
  let questionsData: unknown[];
  try {
    questionsData = JSON.parse(rawData);
    if (!Array.isArray(questionsData)) {
      throw new Error("Expected JSON array");
    }
  } catch (err) {
    console.error(`❌ Invalid JSON file: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const checksum = computeChecksum(rawData);
  const sourceFilename = path.basename(resolvedFilePath);

  console.log(`📥 Importing ${questionsData.length} questions from ${sourceFilename}...`);
  console.log(`   Type: ${cliArgs.questionType}, Exam: ${cliArgs.examType}`);

  const result = await importManualQuestions({
    sourceFilename,
    checksum,
    importedBy: cliArgs.importedBy,
    questionType: cliArgs.questionType,
    examType: cliArgs.examType,
    primaryKpId: cliArgs.primaryKpId,
    questionsData,
  });

  console.log(`\n✅ Import complete:`);
  console.log(`   Batch: ${result.batchId}`);
  console.log(`   Status: ${result.batchStatus}`);
  console.log(`   Total: ${result.total}`);
  console.log(`   Imported: ${result.imported}`);
  console.log(`   Rejected: ${result.rejected.length}`);

  if (result.rejected.length > 0) {
    console.log("\n❌ Rejected items:");
    for (const r of result.rejected) {
      console.log(`   #${r.index}: ${r.reason}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
